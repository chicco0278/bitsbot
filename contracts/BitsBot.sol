pragma solidity ^0.6.0;

import './interfaces/IERC20.sol';
import './IOneSplit.sol';
import './DyDxFlashLoan.sol';


contract BitsBot is DyDxFlashLoan {
    uint256 public loan;
    address payable OWNER;
    address ONE_SPLIT_ADDRESS = 0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E;
    uint256 PARTS = 10;
    uint256 FLAGS = 0;
    address ZRX_EXCHANGE_ADDRESS = 0x61935CbDd02287B511119DDb11Aeb42F1593b7Ef;
    address ZRX_ERC20_PROXY_ADDRESS = 0x95E6F48254609A6ee006F7D493c8e5fB97094ceF;
    address ZRX_STAKING_PROXY = 0xa26e80e7Dea86279c6d778D702Cc413E6CFfA777;

    modifier onlyOwner() {
        require(msg.sender == OWNER, "caller is not the owner!");
        _;
    }

    fallback () external payable  {}

    constructor() public payable {
        _getWeth(msg.value);
        _approveWeth(msg.value);
        OWNER = msg.sender;
    }

    function getFlashloan(address flashToken, uint256 flashAmount, address arbToken, bytes calldata zrxData, uint256 oneSplitMinReturn, uint256[] calldata oneSplitDistribution) external payable onlyOwner {
        uint256 balanceBefore = IERC20(flashToken).balanceOf(address(this));
        bytes memory data = abi.encode(flashToken, flashAmount, balanceBefore, arbToken, zrxData, oneSplitMinReturn, oneSplitDistribution);
        flashloan(flashToken, flashAmount, data);
    }

    function callFunction(
        address,
        Info calldata,
        bytes calldata data
    ) external onlyPool {
        (address flashToken, uint256 flashAmount, uint256 balanceBefore, address arbToken, bytes memory zrxData, uint256 oneSplitMinReturn, uint256[] memory oneSplitDistribution) = abi
            .decode(data, (address, uint256, uint256, address, bytes, uint256, uint256[]));
        uint256 balanceAfter = IERC20(flashToken).balanceOf(address(this));
        require(
            balanceAfter - balanceBefore == flashAmount,
            "contract did not get the loan"
        );
        loan = balanceAfter;
        _arb(flashToken, arbToken, flashAmount, zrxData, oneSplitMinReturn, oneSplitDistribution);
    }

    function arb(address _fromToken, address _toToken, uint256 _fromAmount, bytes memory _0xData, uint256 _1SplitMinReturn, uint256[] memory _1SplitDistribution) onlyOwner payable public {
        _arb(_fromToken, _toToken, _fromAmount, _0xData, _1SplitMinReturn, _1SplitDistribution);
    }

    function _arb(address _fromToken, address _toToken, uint256 _fromAmount, bytes memory _0xData, uint256 _1SplitMinReturn, uint256[] memory _1SplitDistribution) internal {
        uint256 _startBalance = IERC20(_fromToken).balanceOf(address(this));
        _trade(_fromToken, _toToken, _fromAmount, _0xData, _1SplitMinReturn, _1SplitDistribution);
        uint256 _endBalance = IERC20(_fromToken).balanceOf(address(this));
        require(_endBalance > _startBalance, "End balance must exceed start balance.");
    }

    function trade(address _fromToken, address _toToken, uint256 _fromAmount, bytes memory _0xData, uint256 _1SplitMinReturn, uint256[] memory _1SplitDistribution) onlyOwner payable public {
        _trade(_fromToken, _toToken, _fromAmount, _0xData, _1SplitMinReturn, _1SplitDistribution);
    }

    function _trade(address _fromToken, address _toToken, uint256 _fromAmount, bytes memory _0xData, uint256 _1SplitMinReturn, uint256[] memory _1SplitDistribution) internal {
        uint256 _beforeBalance = IERC20(_toToken).balanceOf(address(this));
        _zrxSwap(_fromToken, _fromAmount, _0xData);
        uint256 _afterBalance = IERC20(_toToken).balanceOf(address(this));
        uint256 _toAmount = _afterBalance - _beforeBalance;
        _oneSplitSwap(_toToken, _fromToken, _toAmount, _1SplitMinReturn, _1SplitDistribution);
    }

    function zrxSwap(address _from, uint256 _amount, bytes memory _calldataHexString) onlyOwner public payable {
        _zrxSwap(_from, _amount, _calldataHexString);
    }

    function _zrxSwap(address _from, uint256 _amount, bytes memory _calldataHexString) internal {
        IERC20 _fromIERC20 = IERC20(_from);
        _fromIERC20.approve(ZRX_ERC20_PROXY_ADDRESS, _amount);
        address(ZRX_EXCHANGE_ADDRESS).call.value(msg.value)(_calldataHexString);
        _fromIERC20.approve(ZRX_ERC20_PROXY_ADDRESS, 0);
    }

    function oneSplitSwap(address _from, address _to, uint256 _amount, uint256 _minReturn, uint256[] memory _distribution) onlyOwner public payable {
        _oneSplitSwap(_from, _to, _amount, _minReturn, _distribution);
    }

    function _oneSplitSwap(address _from, address _to, uint256 _amount, uint256 _minReturn, uint256[] memory _distribution) internal {
        IERC20 _fromIERC20 = IERC20(_from);
        IERC20 _toIERC20 = IERC20(_to);
        IOneSplit _oneSplitContract = IOneSplit(ONE_SPLIT_ADDRESS);
        _fromIERC20.approve(ONE_SPLIT_ADDRESS, _amount);
        _oneSplitContract.swap(_fromIERC20, _toIERC20, _amount, _minReturn, _distribution, FLAGS);
        _fromIERC20.approve(ONE_SPLIT_ADDRESS, 0);
    }

    function getWeth() public payable onlyOwner {
        _getWeth(msg.value);
    }

    function _getWeth(uint256 _amount) internal {
        (bool success, ) = WETH.call.value(_amount)("");
        require(success, "failed to get weth");
    }

    function approveWeth(uint256 _amount) public onlyOwner {
        _approveWeth(_amount);
    }

    function _approveWeth(uint256 _amount) internal {
        IERC20(WETH).approve(ZRX_STAKING_PROXY, _amount);
    }

    function withdrawToken(address _tokenAddress) public onlyOwner {
        uint256 balance = IERC20(_tokenAddress).balanceOf(address(this));
        IERC20(_tokenAddress).transfer(OWNER, balance);
    }

    function withdrawEther() public onlyOwner {
        address self = address(this);
        uint256 balance = self.balance;
        OWNER.transfer(balance);
    }
}