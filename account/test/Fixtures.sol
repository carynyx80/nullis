// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {NullispadPublicAccount,IRouter02} from "../PublicAccount.sol";
contract Token is ERC20 {
    bool public fee;
    bool public fail;
    address public callback;
    bool public callbackSucceeded;
    constructor() ERC20("Test only", "TEST") {}
    function mint(address to,uint256 value) public { _mint(to,value); }
    function configure(bool fee_,bool fail_,address callback_) external {fee=fee_;fail=fail_;callback=callback_;}
    function transfer(address to,uint256 value) public override returns(bool) {if(fail)return false;return super.transfer(to,value);}
    function transferFrom(address from,address to,uint256 value) public override returns(bool) {if(fail)return false;return super.transferFrom(from,to,value);}
    function _update(address from,address to,uint256 value) internal override {
        if(callback!=address(0)&&from!=address(0)){(callbackSucceeded,)=callback.call(abi.encodeCall(NullispadPublicAccount.withdraw,(address(this),1)));}
        if(fee&&from!=address(0)&&to!=address(0)&&value>0){super._update(from,to,value-1);super._update(from,address(0),1);}else super._update(from,to,value);
    }
}
contract Weth is Token {
    bool public shortDeposit;
    bool public shortWithdrawal;
    function configureWrap(bool in_,bool out_)external{shortDeposit=in_;shortWithdrawal=out_;}
    function deposit() external payable {_mint(msg.sender,shortDeposit?msg.value-1:msg.value);}
    function withdraw(uint256 value) external {_burn(msg.sender,value);(bool ok,)=msg.sender.call{value:shortWithdrawal?value-1:value}("");require(ok);}
}
contract Factory {}
contract Router {
    address public immutable WETH9;
    address public immutable factory;
    bool public shortInput;
    bool public noOutput;
    constructor(address weth,address factory_){WETH9=weth;factory=factory_;}
    function configure(bool short_,bool noOutput_) external {shortInput=short_;noOutput=noOutput_;}
    function exactInputSingle(IRouter02.ExactInputSingleParams calldata p) external payable returns(uint256) {
        require(Token(p.tokenIn).transferFrom(msg.sender,address(this),shortInput?p.amountIn-1:p.amountIn));
        if(!noOutput)Token(p.tokenOut).mint(p.recipient,p.amountIn);
        return p.amountIn;
    }
}
contract Recipient {
    NullispadPublicAccount public account;
    bool public fail;
    bool public reentered;
    constructor(NullispadPublicAccount account_){account=account_;}
    function configure(bool fail_)external{fail=fail_;}
    function deposit()external payable{account.depositNative{value:msg.value}();}
    function withdraw(uint256 amount)external{account.withdraw(address(0),amount);}
    receive()external payable{require(!fail);(reentered,)=address(account).call(abi.encodeCall(NullispadPublicAccount.withdraw,(address(0),1)));}
}
