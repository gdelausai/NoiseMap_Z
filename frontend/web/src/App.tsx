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
  encryptedValue: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
  locationHint: string;
}

interface NoiseStats {
  totalReports: number;
  avgDecibel: number;
  maxDecibel: number;
  verifiedCount: number;
  recentActivity: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [noiseData, setNoiseData] = useState<NoiseData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportingNoise, setReportingNoise] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newNoiseData, setNewNoiseData] = useState({ 
    name: "", 
    decibel: "", 
    location: "",
    description: "" 
  });
  const [selectedNoise, setSelectedNoise] = useState<NoiseData | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [stats, setStats] = useState<NoiseStats>({
    totalReports: 0,
    avgDecibel: 0,
    maxDecibel: 0,
    verifiedCount: 0,
    recentActivity: 0
  });
  const [showFAQ, setShowFAQ] = useState(false);
  const [heatmapData, setHeatmapData] = useState<number[]>([]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  const neonColors = {
    primary: '#8B5FBF',
    secondary: '#FF6B9D',
    accent: '#00D4FF',
    background: '#0A0A0A',
    surface: '#1A1A1A',
    text: '#FFFFFF'
  };

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        console.error('FHEVM initialization failed:', error);
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
        await loadNoiseData();
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

  useEffect(() => {
    calculateStats();
    generateHeatmap();
  }, [noiseData]);

  const loadNoiseData = async () => {
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
            encryptedValue: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            locationHint: `Area ${Math.floor(Math.random() * 100)}`
          });
        } catch (e) {
          console.error('Error loading noise data:', e);
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

  const calculateStats = () => {
    const totalReports = noiseData.length;
    const verifiedData = noiseData.filter(d => d.isVerified);
    const verifiedCount = verifiedData.length;
    
    const avgDecibel = verifiedData.length > 0 
      ? verifiedData.reduce((sum, d) => sum + (d.decryptedValue || d.publicValue1), 0) / verifiedData.length 
      : 0;
    
    const maxDecibel = verifiedData.length > 0 
      ? Math.max(...verifiedData.map(d => d.decryptedValue || d.publicValue1))
      : 0;
    
    const recentActivity = noiseData.filter(d => 
      Date.now()/1000 - d.timestamp < 60 * 60 * 24
    ).length;

    setStats({
      totalReports,
      avgDecibel,
      maxDecibel,
      verifiedCount,
      recentActivity
    });
  };

  const generateHeatmap = () => {
    const mockHeatmap = Array.from({ length: 25 }, () => Math.floor(Math.random() * 100));
    setHeatmapData(mockHeatmap);
  };

  const reportNoise = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setReportingNoise(true);
    setTransactionStatus({ visible: true, status: "pending", message: "使用Zama FHE加密噪音数据..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("获取合约失败");
      
      const decibelValue = parseInt(newNoiseData.decibel) || 0;
      const businessId = `noise-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, decibelValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newNoiseData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        Math.floor(Math.random() * 10) + 1,
        0,
        newNoiseData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "噪音报告提交成功！" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadNoiseData();
      setShowReportModal(false);
      setNewNoiseData({ name: "", decibel: "", location: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用户取消了交易" 
        : "提交失败: " + (e.message || "未知错误");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setReportingNoise(false); 
    }
  };

  const decryptNoiseData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
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
        setTransactionStatus({ visible: true, status: "success", message: "数据已在链上验证" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
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
      
      setTransactionStatus({ visible: true, status: "pending", message: "在链上验证解密..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadNoiseData();
      
      setTransactionStatus({ visible: true, status: "success", message: "数据解密验证成功！" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "数据已在链上验证" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadNoiseData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "解密失败: " + (e.message || "未知错误") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const testAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("合约不可用");
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "FHE合约可用性检查通过！" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "可用性检查失败" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderStatsPanel = () => {
    return (
      <div className="stats-panels">
        <div className="stat-panel neon-panel">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>总报告数</h3>
            <div className="stat-value">{stats.totalReports}</div>
            <div className="stat-trend">+{stats.recentActivity} 今日</div>
          </div>
        </div>
        
        <div className="stat-panel neon-panel">
          <div className="stat-icon">🔊</div>
          <div className="stat-content">
            <h3>平均分贝</h3>
            <div className="stat-value">{stats.avgDecibel.toFixed(1)}dB</div>
            <div className="stat-trend">FHE加密</div>
          </div>
        </div>
        
        <div className="stat-panel neon-panel">
          <div className="stat-icon">⚠️</div>
          <div className="stat-content">
            <h3>最高分贝</h3>
            <div className="stat-value">{stats.maxDecibel}dB</div>
            <div className="stat-trend">峰值监测</div>
          </div>
        </div>
        
        <div className="stat-panel neon-panel">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>已验证数据</h3>
            <div className="stat-value">{stats.verifiedCount}/{stats.totalReports}</div>
            <div className="stat-trend">链上验证</div>
          </div>
        </div>
      </div>
    );
  };

  const renderHeatmap = () => {
    return (
      <div className="heatmap-container">
        <h3>噪音热力图分布</h3>
        <div className="heatmap-grid">
          {heatmapData.map((intensity, index) => (
            <div 
              key={index}
              className="heatmap-cell"
              style={{
                backgroundColor: `rgb(${Math.min(255, intensity * 2.5)}, ${Math.max(0, 255 - intensity * 2.5)}, 100)`,
                opacity: intensity / 100
              }}
              title={`噪音强度: ${intensity}%`}
            />
          ))}
        </div>
        <div className="heatmap-legend">
          <span>低</span>
          <div className="legend-gradient"></div>
          <span>高</span>
        </div>
      </div>
    );
  };

  const renderFHEProcess = () => {
    return (
      <div className="fhe-process">
        <div className="process-step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h4>本地加密</h4>
            <p>噪音数据在本地使用Zama FHE加密</p>
          </div>
        </div>
        <div className="process-arrow">➡</div>
        <div className="process-step">
          <div className="step-number">2</div>
          <div className="step-content">
            <h4>链上存储</h4>
            <p>加密数据安全存储在区块链上</p>
          </div>
        </div>
        <div className="process-arrow">➡</div>
        <div className="process-step">
          <div className="step-number">3</div>
          <div className="step-content">
            <h4>同态计算</h4>
            <p>在加密状态下进行数据聚合分析</p>
          </div>
        </div>
        <div className="process-arrow">➡</div>
        <div className="process-step">
          <div className="step-number">4</div>
          <div className="step-content">
            <h4>安全解密</h4>
            <p>授权用户可安全解密查看结果</p>
          </div>
        </div>
      </div>
    );
  };

  const faqItems = [
    {
      question: "什么是全同态加密（FHE）？",
      answer: "全同态加密允许在加密数据上直接进行计算，无需解密，确保数据隐私安全。"
    },
    {
      question: "我的位置信息会被泄露吗？",
      answer: "不会。我们只收集加密的噪音分贝数据，不收集具体位置信息。"
    },
    {
      question: "如何验证数据的真实性？",
      answer: "通过FHE解密验证流程，确保数据在链上得到验证且未被篡改。"
    },
    {
      question: "数据加密需要额外费用吗？",
      answer: "加密解密在本地完成，只有链上验证需要支付少量Gas费。"
    }
  ];

  if (!isConnected) {
    return (
      <div className="app-container" style={{ background: neonColors.background, color: neonColors.text }}>
        <header className="app-header">
          <div className="logo">
            <h1 style={{ background: `linear-gradient(45deg, ${neonColors.primary}, ${neonColors.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              隐私噪音地图 🔇
            </h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>连接钱包开始使用</h2>
            <p>连接您的钱包来初始化FHE加密系统，参与社区噪音监测</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>点击上方按钮连接钱包</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE系统自动初始化</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>开始加密报告噪音数据</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen" style={{ background: neonColors.background, color: neonColors.text }}>
        <div className="fhe-spinner" style={{ borderColor: `${neonColors.accent} transparent transparent transparent` }}></div>
        <p>初始化FHE加密系统...</p>
        <p>状态: {fhevmInitializing ? "初始化FHEVM" : status}</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen" style={{ background: neonColors.background, color: neonColors.text }}>
      <div className="fhe-spinner" style={{ borderColor: `${neonColors.accent} transparent transparent transparent` }}></div>
      <p>加载加密噪音地图...</p>
    </div>
  );

  return (
    <div className="app-container" style={{ background: neonColors.background, color: neonColors.text }}>
      <header className="app-header">
        <div className="logo">
          <h1 style={{ background: `linear-gradient(45deg, ${neonColors.primary}, ${neonColors.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            隐私噪音地图 🔇
          </h1>
          <p style={{ color: neonColors.secondary }}>FHE加密保护您的隐私</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowReportModal(true)} 
            className="report-btn"
            style={{ background: `linear-gradient(45deg, ${neonColors.primary}, ${neonColors.secondary})` }}
          >
            📢 报告噪音
          </button>
          <button 
            onClick={testAvailability}
            className="test-btn"
            style={{ background: neonColors.surface, border: `1px solid ${neonColors.accent}` }}
          >
            测试合约
          </button>
          <button 
            onClick={() => setShowFAQ(!showFAQ)}
            className="faq-btn"
            style={{ background: neonColors.surface }}
          >
            ❓ FAQ
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-section">
          <h2>社区噪音监测仪表板</h2>
          {renderStatsPanel()}
          
          <div className="content-panels">
            <div className="panel main-panel">
              <h3>🔐 FHE加密流程</h3>
              {renderFHEProcess()}
            </div>
            
            <div className="panel main-panel">
              <h3>🌍 噪音热力图</h3>
              {renderHeatmap()}
            </div>
          </div>
        </div>
        
        <div className="reports-section">
          <div className="section-header">
            <h2>最新噪音报告</h2>
            <div className="header-actions">
              <button 
                onClick={loadNoiseData} 
                className="refresh-btn" 
                disabled={isRefreshing}
                style={{ background: neonColors.surface }}
              >
                {isRefreshing ? "刷新中..." : "🔄 刷新"}
              </button>
            </div>
          </div>
          
          <div className="reports-list">
            {noiseData.length === 0 ? (
              <div className="no-reports">
                <p>暂无噪音报告</p>
                <button 
                  className="report-btn"
                  onClick={() => setShowReportModal(true)}
                  style={{ background: `linear-gradient(45deg, ${neonColors.primary}, ${neonColors.secondary})` }}
                >
                  提交第一个报告
                </button>
              </div>
            ) : (
              noiseData.map((noise, index) => (
                <div 
                  className={`report-item ${selectedNoise?.id === noise.id ? "selected" : ""} ${noise.isVerified ? "verified" : ""}`}
                  key={index}
                  onClick={() => setSelectedNoise(noise)}
                  style={{ 
                    background: noise.isVerified ? 
                      `linear-gradient(45deg, ${neonColors.surface}, #1a2a1a)` : 
                      neonColors.surface 
                  }}
                >
                  <div className="report-header">
                    <div className="report-title">{noise.name}</div>
                    <div className="report-status">
                      {noise.isVerified ? "✅ 已验证" : "🔓 待验证"}
                    </div>
                  </div>
                  <div className="report-meta">
                    <span>位置提示: {noise.locationHint}</span>
                    <span>时间: {new Date(noise.timestamp * 1000).toLocaleString()}</span>
                  </div>
                  <div className="report-description">{noise.description}</div>
                  <div className="report-creator">
                    报告者: {noise.creator.substring(0, 6)}...{noise.creator.substring(38)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {showFAQ && (
          <div className="faq-section">
            <h2>常见问题解答</h2>
            <div className="faq-list">
              {faqItems.map((item, index) => (
                <div key={index} className="faq-item">
                  <h4>{item.question}</h4>
                  <p>{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {showReportModal && (
        <ReportModal 
          onSubmit={reportNoise}
          onClose={() => setShowReportModal(false)}
          reporting={reportingNoise}
          noiseData={newNoiseData}
          setNoiseData={setNewNoiseData}
          isEncrypting={isEncrypting}
          neonColors={neonColors}
        />
      )}
      
      {selectedNoise && (
        <NoiseDetailModal 
          noise={selectedNoise}
          onClose={() => setSelectedNoise(null)}
          isDecrypting={isDecrypting || fheIsDecrypting}
          decryptData={() => decryptNoiseData(selectedNoise.id)}
          neonColors={neonColors}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div 
            className="transaction-content"
            style={{ 
              background: neonColors.surface,
              border: `2px solid ${transactionStatus.status === "success" ? neonColors.accent : transactionStatus.status === "error" ? neonColors.secondary : neonColors.primary}`
            }}
          >
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner" style={{ borderColor: `${neonColors.primary} transparent transparent transparent` }}></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ReportModal: React.FC<{
  onSubmit: () => void;
  onClose: () => void;
  reporting: boolean;
  noiseData: any;
  setNoiseData: (data: any) => void;
  isEncrypting: boolean;
  neonColors: any;
}> = ({ onSubmit, onClose, reporting, noiseData, setNoiseData, isEncrypting, neonColors }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'decibel') {
      const intValue = value.replace(/[^\d]/g, '');
      setNoiseData({ ...noiseData, [name]: intValue });
    } else {
      setNoiseData({ ...noiseData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div 
        className="report-modal"
        style={{ 
          background: `linear-gradient(135deg, ${neonColors.surface}, #2a2a2a)`,
          border: `2px solid ${neonColors.primary}`
        }}
      >
        <div className="modal-header">
          <h2>报告噪音数据</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice" style={{ background: neonColors.background + '80' }}>
            <strong>🔐 FHE加密保护</strong>
            <p>分贝数据将使用Zama FHE进行加密处理，保护您的隐私</p>
          </div>
          
          <div className="form-group">
            <label>地点名称 *</label>
            <input 
              type="text" 
              name="name" 
              value={noiseData.name} 
              onChange={handleChange} 
              placeholder="例如: 社区公园、商业街区..."
              style={{ background: neonColors.background, color: neonColors.text }}
            />
          </div>
          
          <div className="form-group">
            <label>噪音分贝值 (整数) *</label>
            <input 
              type="number" 
              name="decibel" 
              value={noiseData.decibel} 
              onChange={handleChange} 
              placeholder="输入分贝值..."
              step="1"
              min="0"
              max="150"
              style={{ background: neonColors.background, color: neonColors.text }}
            />
            <div className="data-type-label">FHE加密整数数据</div>
          </div>
          
          <div className="form-group">
            <label>区域描述</label>
            <textarea 
              name="description" 
              value={noiseData.description} 
              onChange={handleChange} 
              placeholder="描述噪音环境和类型..."
              style={{ background: neonColors.background, color: neonColors.text }}
            />
            <div className="data-type-label">公开描述信息</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose} 
            className="cancel-btn"
            style={{ background: neonColors.background }}
          >
            取消
          </button>
          <button 
            onClick={onSubmit} 
            disabled={reporting || isEncrypting || !noiseData.name || !noiseData.decibel}
            className="submit-btn"
            style={{ background: `linear-gradient(45deg, ${neonColors.primary}, ${neonColors.secondary})` }}
          >
            {reporting || isEncrypting ? "加密并提交中..." : "提交报告"}
          </button>
        </div>
      </div>
    </div>
  );
};

const NoiseDetailModal: React.FC<{
  noise: any;
  onClose: () => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  neonColors: any;
}> = ({ noise, onClose, isDecrypting, decryptData, neonColors }) => {
  const handleDecrypt = async () => {
    await decryptData();
  };

  return (
    <div className="modal-overlay">
      <div 
        className="noise-detail-modal"
        style={{ 
          background: `linear-gradient(135deg, ${neonColors.surface}, #2a2a2a)`,
          border: `2px solid ${noise.isVerified ? neonColors.accent : neonColors.primary}`
        }}
      >
        <div className="modal-header">
          <h2>噪音报告详情</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="noise-info">
            <div className="info-item">
              <span>地点名称:</span>
              <strong>{noise.name}</strong>
            </div>
            <div className="info-item">
              <span>报告者:</span>
              <strong>{noise.creator.substring(0, 6)}...{noise.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>报告时间:</span>
              <strong>{new Date(noise.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-item">
              <span>位置提示:</span>
              <strong>{noise.locationHint}</strong>
            </div>
          </div>
          
          <div className="description-section">
            <h4>环境描述</h4>
            <p>{noise.description}</p>
          </div>
          
          <div className="data-section">
            <h3>🔐 加密噪音数据</h3>
            
            <div className="data-row">
              <div className="data-label">分贝值:</div>
              <div className="data-value">
                {noise.isVerified ? 
                  `${noise.decryptedValue} dB (链上已验证)` : 
                  "🔒 FHE加密数据"
                }
              </div>
              <button 
                className={`decrypt-btn ${noise.isVerified ? 'verified' : ''}`}
                onClick={handleDecrypt}
                disabled={isDecrypting}
                style={{ 
                  background: noise.isVerified ? 
                    neonColors.accent : 
                    `linear-gradient(45deg, ${neonColors.primary}, ${neonColors.secondary})`
                }}
              >
                {isDecrypting ? "验证中..." : noise.isVerified ? "✅ 已验证" : "🔓 验证解密"}
              </button>
            </div>
            
            <div className="fhe-info" style={{ background: neonColors.background + '80' }}>
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE自中继解密</strong>
                <p>数据在链上加密存储。点击"验证解密"进行离线解密和链上验证。</p>
              </div>
            </div>
          </div>
          
          {noise.isVerified && (
            <div className="analysis-section">
              <h3>📈 数据分析</h3>
              <div className="decibel-display">
                <div className="decibel-value">{noise.decryptedValue}</div>
                <div className="decibel-unit">dB</div>
              </div>
              <div className="noise-level">
                噪音级别: {noise.decryptedValue < 40 ? "安静" : noise.decryptedValue < 70 ? "适中" : "嘈杂"}
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose} 
            className="close-btn"
            style={{ background: neonColors.background }}
          >
            关闭
          </button>
          {!noise.isVerified && (
            <button 
              onClick={handleDecrypt}
              disabled={isDecrypting}
              className="verify-btn"
              style={{ background: `linear-gradient(45deg, ${neonColors.primary}, ${neonColors.secondary})` }}
            >
              {isDecrypting ? "链上验证中..." : "链上验证"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

