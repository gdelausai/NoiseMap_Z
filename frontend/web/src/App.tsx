import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface NoiseData {
  id: string;
  name: string;
  decibel: number;
  location: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [noiseData, setNoiseData] = useState<NoiseData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingNoise, setCreatingNoise] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newNoiseData, setNewNoiseData] = useState({ name: "", decibel: "", location: "" });
  const [selectedNoise, setSelectedNoise] = useState<NoiseData | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const noiseList: NoiseData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          noiseList.push({
            id: businessId,
            name: businessData.name,
            decibel: Number(businessData.decryptedValue) || 0,
            location: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setNoiseData(noiseList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createNoiseData = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingNoise(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating noise data with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const decibelValue = parseInt(newNoiseData.decibel) || 0;
      const businessId = `noise-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, decibelValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newNoiseData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        0,
        0,
        newNoiseData.location
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Noise data created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewNoiseData({ name: "", decibel: "", location: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingNoise(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Contract is available and working!" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredData = noiseData.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🔇 FHE Noise Map</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔇</div>
            <h2>Connect Your Wallet</h2>
            <p>Connect your wallet to access the encrypted noise mapping system</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted noise data...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🔇 FHE Noise Map</h1>
          <p>Privacy-Preserving Community Noise Monitoring</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="availability-btn">
            Check Availability
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + Report Noise
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panel">
          <div className="stat-card">
            <h3>Total Reports</h3>
            <div className="stat-value">{noiseData.length}</div>
          </div>
          <div className="stat-card">
            <h3>Verified Data</h3>
            <div className="stat-value">{noiseData.filter(d => d.isVerified).length}</div>
          </div>
          <div className="stat-card">
            <h3>Avg Decibel</h3>
            <div className="stat-value">
              {noiseData.length > 0 ? 
                Math.round(noiseData.reduce((sum, d) => sum + (d.decibel || 0), 0) / noiseData.length) : 0}dB
            </div>
          </div>
        </div>

        <div className="search-section">
          <input
            type="text"
            placeholder="Search by name or location..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="search-input"
          />
          <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="data-list">
          {paginatedData.length === 0 ? (
            <div className="no-data">
              <p>No noise data found</p>
              <button onClick={() => setShowCreateModal(true)} className="create-btn">
                Report First Noise
              </button>
            </div>
          ) : (
            paginatedData.map((item, index) => (
              <div 
                key={index}
                className={`data-item ${selectedNoise?.id === item.id ? "selected" : ""}`}
                onClick={() => setSelectedNoise(item)}
              >
                <div className="item-header">
                  <h3>{item.name}</h3>
                  <span className={`status ${item.isVerified ? "verified" : "pending"}`}>
                    {item.isVerified ? "✅ Verified" : "🔓 Pending"}
                  </span>
                </div>
                <div className="item-details">
                  <span>Location: {item.location}</span>
                  <span>Decibel: {item.isVerified ? `${item.decryptedValue}dB` : "🔒 Encrypted"}</span>
                  <span>Date: {new Date(item.timestamp * 1000).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        )}

        <div className="info-panel">
          <h3>About FHE Noise Map</h3>
          <p>This system uses Fully Homomorphic Encryption (FHE) to protect your privacy while contributing to community noise monitoring.</p>
          <div className="feature-list">
            <div className="feature">
              <span>🔐</span>
              <span>Noise levels encrypted before submission</span>
            </div>
            <div className="feature">
              <span>🌍</span>
              <span>Aggregate data contributes to community map</span>
            </div>
            <div className="feature">
              <span>🙈</span>
              <span>Your exact location remains private</span>
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Report Noise Data</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Location Description</label>
                <input 
                  type="text"
                  value={newNoiseData.location}
                  onChange={(e) => setNewNoiseData({...newNoiseData, location: e.target.value})}
                  placeholder="e.g., Central Park area"
                />
              </div>
              <div className="form-group">
                <label>Noise Level Name</label>
                <input 
                  type="text"
                  value={newNoiseData.name}
                  onChange={(e) => setNewNoiseData({...newNoiseData, name: e.target.value})}
                  placeholder="e.g., Traffic noise"
                />
              </div>
              <div className="form-group">
                <label>Decibel Level (Integer)</label>
                <input 
                  type="number"
                  value={newNoiseData.decibel}
                  onChange={(e) => setNewNoiseData({...newNoiseData, decibel: e.target.value})}
                  placeholder="e.g., 65"
                  min="0"
                  max="150"
                />
                <small>This value will be FHE encrypted</small>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button 
                onClick={createNoiseData}
                disabled={creatingNoise || isEncrypting || !newNoiseData.name || !newNoiseData.decibel || !newNoiseData.location}
              >
                {creatingNoise || isEncrypting ? "Encrypting..." : "Submit Encrypted Data"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedNoise && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Noise Data Details</h2>
              <button onClick={() => setSelectedNoise(null)} className="close-btn">&times;</button>
            </div>
            <div className="modal-body">
              <div className="detail-item">
                <label>Name:</label>
                <span>{selectedNoise.name}</span>
              </div>
              <div className="detail-item">
                <label>Location:</label>
                <span>{selectedNoise.location}</span>
              </div>
              <div className="detail-item">
                <label>Date:</label>
                <span>{new Date(selectedNoise.timestamp * 1000).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Decibel Level:</label>
                <span>
                  {selectedNoise.isVerified ? 
                    `${selectedNoise.decryptedValue}dB (Verified)` : 
                    decryptedValue !== null ? 
                    `${decryptedValue}dB (Local)` : 
                    "🔒 Encrypted"
                  }
                </span>
              </div>
              <div className="detail-item">
                <label>Status:</label>
                <span className={`status ${selectedNoise.isVerified ? "verified" : "pending"}`}>
                  {selectedNoise.isVerified ? "On-chain Verified" : "Pending Verification"}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setSelectedNoise(null)}>Close</button>
              {!selectedNoise.isVerified && (
                <button 
                  onClick={async () => {
                    const result = await decryptData(selectedNoise.id);
                    if (result !== null) setDecryptedValue(result);
                  }}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : "Verify Decryption"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            {transactionStatus.status === "pending" && <div className="spinner"></div>}
            {transactionStatus.status === "success" && <span>✓</span>}
            {transactionStatus.status === "error" && <span>✗</span>}
            <span>{transactionStatus.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;