// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PRONOUS Proof of Action Anchor
/// @notice Minimal on-chain evidence layer. User pays BNB gas.
/// @dev Does not execute swaps. Only anchors poaHash + status.
contract PoaAnchor {
    // 0 PLANNED, 1 SIMULATED, 2 CONFIRMED, 3 EXECUTED, 4 BLOCKED, 5 REJECTED, 6 EXPIRED
    event PoaAnchored(
        bytes32 indexed poaHash,
        address indexed actor,
        uint8 status,
        uint64 timestamp,
        string poaId
    );

    struct Record {
        address actor;
        uint8 status;
        uint64 timestamp;
        string poaId;
    }

    mapping(bytes32 => Record) public records;
    mapping(bytes32 => bool) public anchored;

    error AlreadyAnchored();
    error InvalidHash();
    error InvalidStatus();

    function anchor(bytes32 poaHash, uint8 status, string calldata poaId) external {
        if (poaHash == bytes32(0)) revert InvalidHash();
        if (status > 6) revert InvalidStatus();
        if (anchored[poaHash]) revert AlreadyAnchored();

        anchored[poaHash] = true;
        records[poaHash] = Record({
            actor: msg.sender,
            status: status,
            timestamp: uint64(block.timestamp),
            poaId: poaId
        });

        emit PoaAnchored(poaHash, msg.sender, status, uint64(block.timestamp), poaId);
    }

    function getRecord(bytes32 poaHash)
        external
        view
        returns (address actor, uint8 status, uint64 timestamp, string memory poaId, bool exists)
    {
        exists = anchored[poaHash];
        if (!exists) return (address(0), 0, 0, "", false);
        Record memory r = records[poaHash];
        return (r.actor, r.status, r.timestamp, r.poaId, true);
    }
}
