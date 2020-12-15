pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import './interfaces/Structs.sol';

abstract contract DyDxPool is Structs {
    function getAccountWei(Info memory account, uint256 marketId) public view virtual returns (Wei memory);
    function operate(Info[] memory, ActionArgs[] memory) public virtual;
}
