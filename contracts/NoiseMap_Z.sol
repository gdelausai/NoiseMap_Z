pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract NoiseMapAdapter is ZamaEthereumConfig {
    
    struct NoiseReading {
        string locationId;              
        euint32 encryptedDecibels;      
        uint256 timestamp;              
        uint256 publicMetadata;         
        address submitter;              
        uint32 decryptedValue;          
        bool isVerified;                
    }
    
    mapping(string => NoiseReading) public noiseReadings;
    string[] public locationIds;
    
    event NoiseReadingSubmitted(string indexed locationId, address indexed submitter);
    event DecryptionVerified(string indexed locationId, uint32 decryptedValue);
    
    constructor() ZamaEthereumConfig() {
    }
    
    function submitNoiseReading(
        string calldata locationId,
        externalEuint32 encryptedDecibels,
        bytes calldata inputProof,
        uint256 publicMetadata
    ) external {
        require(bytes(noiseReadings[locationId].locationId).length == 0, "Location data already exists");
        
        require(FHE.isInitialized(FHE.fromExternal(encryptedDecibels, inputProof)), "Invalid encrypted input");
        
        noiseReadings[locationId] = NoiseReading({
            locationId: locationId,
            encryptedDecibels: FHE.fromExternal(encryptedDecibels, inputProof),
            timestamp: block.timestamp,
            publicMetadata: publicMetadata,
            submitter: msg.sender,
            decryptedValue: 0,
            isVerified: false
        });
        
        FHE.allowThis(noiseReadings[locationId].encryptedDecibels);
        FHE.makePubliclyDecryptable(noiseReadings[locationId].encryptedDecibels);
        
        locationIds.push(locationId);
        
        emit NoiseReadingSubmitted(locationId, msg.sender);
    }
    
    function verifyDecryption(
        string calldata locationId, 
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(noiseReadings[locationId].locationId).length > 0, "Location data does not exist");
        require(!noiseReadings[locationId].isVerified, "Data already verified");
        
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(noiseReadings[locationId].encryptedDecibels);
        
        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        
        noiseReadings[locationId].decryptedValue = decodedValue;
        noiseReadings[locationId].isVerified = true;
        
        emit DecryptionVerified(locationId, decodedValue);
    }
    
    function getEncryptedDecibels(string calldata locationId) external view returns (euint32) {
        require(bytes(noiseReadings[locationId].locationId).length > 0, "Location data does not exist");
        return noiseReadings[locationId].encryptedDecibels;
    }
    
    function getNoiseReading(string calldata locationId) external view returns (
        string memory locationId_,
        uint256 timestamp,
        uint256 publicMetadata,
        address submitter,
        bool isVerified,
        uint32 decryptedValue
    ) {
        require(bytes(noiseReadings[locationId].locationId).length > 0, "Location data does not exist");
        NoiseReading storage data = noiseReadings[locationId];
        
        return (
            data.locationId,
            data.timestamp,
            data.publicMetadata,
            data.submitter,
            data.isVerified,
            data.decryptedValue
        );
    }
    
    function getAllLocationIds() external view returns (string[] memory) {
        return locationIds;
    }
    
    function isAvailable() public pure returns (bool) {
        return true;
    }
}

