// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {Zeto_AnonEncNullifier} from "zeto/zeto_anon_enc_nullifier.sol";
import {IZetoInitializable} from "zeto/lib/interfaces/IZetoInitializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ZetoCommonStorage} from "zeto/lib/zeto_common.sol";
import {ZetoFungibleStorage} from "zeto/lib/zeto_fungible.sol";
import {Commonlib} from "zeto/lib/common/common.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Experimental adaptation. Not approved for mainnet funds.
/// @dev Atomic initialization permanently removes the owner used by inherited
///      UUPS authorization. There is no external mint route, even during setup.
contract NullisPool is Zeto_AnonEncNullifier {
    using SafeERC20 for IERC20;
    uint256 public constant SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    bytes32 public constant WITHDRAWAL_DOMAIN = keccak256("NULLIS_WITHDRAWAL_V1");
    IERC20 public immutable backingAsset;
    bytes32 public immutable verifierConfiguration;
    uint8 private immutable assetDecimals;

    error InvalidConfiguration();
    error UnbackedMintDisabled();
    error IncorrectAssetMovement();
    error InvalidDepositShape();
    error InvalidWithdrawalShape();
    error PrivateTransfersUnavailable();

    constructor(IERC20 asset, bytes32 configuration) {
        if (address(asset).code.length == 0 || configuration == bytes32(0)) revert InvalidConfiguration();
        backingAsset = asset;
        assetDecimals = IERC20Metadata(address(asset)).decimals();
        verifierConfiguration = configuration;
    }

    /// @dev Must be called atomically by the proxy constructor. The verifier
    ///      configuration is committed in the implementation constructor.
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address initialOwner,
        IZetoInitializable.VerifiersInfo calldata verifiers
    ) public override initializer {
        if (initialOwner != address(0) || keccak256(abi.encode(verifiers)) != verifierConfiguration) revert InvalidConfiguration();
        if (address(verifiers.verifier).code.length == 0 || address(verifiers.depositVerifier).code.length == 0 || address(verifiers.withdrawVerifier).code.length == 0) revert InvalidConfiguration();
        __ZetoAnonEncNullifier_init(name_, symbol_, msg.sender, verifiers);
        setERC20(backingAsset);
        // No transaction can be interleaved between configuration and this step.
        // Ownable2Step also clears any pending owner here.
        _transferOwnership(address(0));
    }

    function mint(uint256[] calldata, bytes calldata) public pure override {
        revert UnbackedMintDisabled();
    }

    /// @dev The inherited transfer statement has not received the same input
    ///      normalization/canonical-key review. Do not expose it through a
    ///      seemingly usable verifier configuration in this prototype.
    function transfer(uint256[] calldata, uint256[] calldata, bytes calldata, bytes calldata) public pure override {
        revert PrivateTransfersUnavailable();
    }

    function decimals() public view override returns (uint8) { return assetDecimals; }
    function noteStore() external view returns (address) { return address(ZetoCommonStorage.layout().utxoStorage); }

    function deposit(uint256 amount, uint256[] calldata outputs, bytes calldata proof, bytes calldata data) public override {
        // The deposit circuit verifies exactly two commitments. Never mint an
        // additional commitment that is not one of those public signals.
        if (amount == 0 || outputs.length != 2) revert InvalidDepositShape();
        uint256 beforeBalance = backingAsset.balanceOf(address(this));
        super.deposit(amount, outputs, proof, data);
        uint256 afterBalance = backingAsset.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) revert IncorrectAssetMovement();
    }

    /// @notice Computes the field-reduced intent hash used by the withdrawal circuit.
    /// @dev Any relayer may submit an authorized proof; it cannot change the payout.
    function withdrawalContext(uint256 amount, uint256[] memory inputs, uint256 output, address recipient, bytes32 changeDataHash) public view returns (uint256) {
        return uint256(keccak256(abi.encode(WITHDRAWAL_DOMAIN, block.chainid, address(this), address(backingAsset), recipient, amount, inputs, output, changeDataHash))) % SNARK_FIELD;
    }

    /// @param data ABI encoding of (address recipient, bytes encryptedChangeData).
    /// @param proof ABI encoding of (uint256 root, Commonlib.Proof groth16Proof).
    function withdraw(uint256 amount, uint256[] calldata inputs, uint256 output, bytes calldata proof, bytes calldata data) public override nonReentrant {
        if (amount == 0 || amount >= 2 ** 100 || inputs.length != 2 || (inputs[0] == 0 && inputs[1] == 0)) revert InvalidWithdrawalShape();
        (address recipient, bytes memory changeData) = abi.decode(data, (address, bytes));
        if (recipient == address(0) || recipient == address(this)) revert InvalidWithdrawalShape();
        (uint256 root, Commonlib.Proof memory proofStruct) = abi.decode(proof, (uint256, Commonlib.Proof));
        uint256[] memory outputs = new uint256[](1);
        outputs[0] = output;
        validateInputs(inputs, false);
        validateOutputs(outputs);
        validateRoot(root);
        uint256[] memory signals = new uint256[](8);
        signals[0] = amount;
        signals[1] = inputs[0];
        signals[2] = inputs[1];
        signals[3] = root;
        signals[4] = inputs[0] == 0 ? 0 : 1;
        signals[5] = inputs[1] == 0 ? 0 : 1;
        signals[6] = output;
        signals[7] = withdrawalContext(amount, inputs, output, recipient, keccak256(changeData));
        if (!ZetoFungibleStorage.layout().withdrawVerifier.verify(proofStruct.pA, proofStruct.pB, proofStruct.pC, signals)) revert InvalidProof();

        uint256 vaultBefore = backingAsset.balanceOf(address(this));
        uint256 recipientBefore = backingAsset.balanceOf(recipient);
        if (vaultBefore < amount) revert IncorrectAssetMovement();
        processInputsAndOutputs(inputs, outputs, false);
        backingAsset.safeTransfer(recipient, amount);
        uint256 vaultAfter = backingAsset.balanceOf(address(this));
        uint256 recipientAfter = backingAsset.balanceOf(recipient);
        if (vaultAfter > vaultBefore || vaultBefore - vaultAfter != amount || recipientAfter < recipientBefore || recipientAfter - recipientBefore != amount) revert IncorrectAssetMovement();
        emit UTXOWithdraw(amount, inputs, output, recipient, changeData);
    }
}
