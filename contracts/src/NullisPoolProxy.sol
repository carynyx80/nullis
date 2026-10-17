// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IZetoInitializable} from "zeto/lib/interfaces/IZetoInitializable.sol";

/// @notice Initializes in its constructor; there is no exposed setup window.
contract NullisPoolProxy is ERC1967Proxy {
    constructor(address implementation, string memory name_, string memory symbol_, IZetoInitializable.VerifiersInfo memory verifiers)
        ERC1967Proxy(implementation, abi.encodeCall(IZetoInitializable.initialize, (name_, symbol_, address(0), verifiers))) {}
}
