// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Append-only commitments to Tradefly decision batches. Does not trade or hold funds.
contract DecisionReceipts {
    address public immutable publisher;
    mapping(bytes32 => uint256) public lastSequence;
    mapping(bytes32 => mapping(uint256 => bytes32)) public commitments;
    event Committed(bytes32 indexed runKey, uint256 indexed firstSequence, uint256 lastSequence, bytes32 digest);

    constructor() { publisher = msg.sender; }

    function commit(bytes32 runKey, uint256 firstSequence, uint256 last, bytes32 digest) external {
        require(msg.sender == publisher, "publisher only");
        require(runKey != bytes32(0) && digest != bytes32(0), "empty commitment");
        require(firstSequence == lastSequence[runKey] + 1, "batch gap or duplicate");
        require(last >= firstSequence && last - firstSequence < 256, "invalid batch range");
        commitments[runKey][firstSequence] = digest;
        lastSequence[runKey] = last;
        emit Committed(runKey, firstSequence, last, digest);
    }
}
