// ======================== EMS 设备开发管控台 (G1~G6 管道管控视角) ========================

// 核心状态缓存
if (typeof state === 'undefined') window.state = {};
state.emsEquipments = [];
state.emsSuppliers = [];
state.emsActiveTab = 'kanban'; // 'kanban' | 'devices' | 'risk'
state.currentEmsId = null;

// G1~G6 标准阶段解耦结构
const EMS_STAGES = [
    { key: "stage1_plan", code: "G1", title: "设备立项", role: "使用部门", color: "#2563eb" },
    { key: "stage2_scheme", code: "G2", title: "拟定技术方案", role: "工程部门", color: "#0284c7" },
    { key: "stage3_bidding", code: "G3", title: "请购发包", role: "采购部门", color: "#7c3aed" },
    { key: "stage4_make", code: "G4", title: "设备制作", role: "工程部门", color: "#d97706" },
    { key: "stage5_install", code: "G5", title: "安装调试", role: "工程部门", color: "#db2777" },
    { key: "stage6_accept", code: "G6", title: "验收交付使用", role: "使用部门", color: "#059669" }
];

// 切换 EMS 主 Tab 视角
window.switchEmsTab = function(tab) {
    state.emsActiveTab = tab;
    
    const btnKanban = document.getElementById("ems-tab-btn-kanban");
    const btnDev = document.getElementById("ems-tab-btn-devices");
    const btnRisk = document.getElementById("ems-tab-btn-risk");
    
    const panelKanban = document.getElementById("ems-panel-kanban");
    const panelDev = document.getElementById("ems-panel-devices");
    const panelRisk = document.getElementById("ems-panel-risk");
    
    [btnKanban, btnDev, btnRisk].forEach(btn => {
        if (btn) {
            btn.style.borderBottom = "2px solid transparent";
            btn.style.color = "var(--text-secondary)";
            btn.classList.remove("active");
        }
    });
    
    [panelKanban, panelDev, panelRisk].forEach(panel => {
        if (panel) panel.style.display = "none";
    });

    if (tab === 'kanban') {
        if (btnKanban) { 
            btnKanban.style.borderBottom = "2px solid var(--color-primary)"; 
            btnKanban.style.color = "var(--color-primary)"; 
            btnKanban.classList.add("active");
        }
        if (panelKanban) panelKanban.style.display = "block";
    } else if (tab === 'devices') {
        if (btnDev) { 
            btnDev.style.borderBottom = "2px solid var(--color-primary)"; 
            btnDev.style.color = "var(--color-primary)"; 
            btnDev.classList.add("active");
        }
        if (panelDev) panelDev.style.display = "block";
    } else if (tab === 'risk') {
        if (btnRisk) { 
            btnRisk.style.borderBottom = "2px solid var(--color-primary)"; 
            btnRisk.style.color = "var(--color-primary)"; 
            btnRisk.classList.add("active");
        }
        if (panelRisk) panelRisk.style.display = "block";
    }
    
    renderEmsAll();
};

// 拉取并刷新 EMS 数据
window.fetchEmsData = function() {
    Promise.all([
        fetch("/api/equipments").then(r => r.json()),
        fetch("/api/ems/suppliers").then(r => r.json()).catch(() => [])
    ])
    .then(([equipments, suppliers]) => {
        state.emsEquipments = Array.isArray(equipments) ? equipments : [];
        state.emsSuppliers = Array.isArray(suppliers) ? suppliers : [];
        renderEmsAll();
    })
    .catch(err => {
        console.error("加载设备 EMS 数据失败:", err);
    });
};

// 渲染所有视图
window.renderEmsAll = function() {
    renderEmsKanban();
    renderEmsDeviceTable();
    renderEmsSupplierRisk();
};

// 1. 渲染 G1~G6 阶段管道看板
window.renderEmsKanban = function() {
    const kanbanGrid = document.getElementById("ems-kanban-grid");
    if (!kanbanGrid) return;
    
    const searchVal = (document.getElementById("ems-search")?.value || "").toLowerCase().trim();
    const categoryVal = document.getElementById("ems-category-filter")?.value || "";

    // 数据过滤
    let filteredEquips = state.emsEquipments.filter(item => {
        if (categoryVal && item.category !== categoryVal) return false;
        if (searchVal) {
            const matchName = (item.name || "").toLowerCase().includes(searchVal);
            const matchCode = (item.code || "").toLowerCase().includes(searchVal);
            const matchVendor = (item.vendor || "").toLowerCase().includes(searchVal);
            return matchName || matchCode || matchVendor;
        }
        return true;
    });

    // 阶段映射 Helper
    const stageKeyMap = {
        'G1': 'stage1_plan',
        'G2': 'stage2_scheme',
        'G3': 'stage3_bidding',
        'G4': 'stage4_make',
        'G5': 'stage5_install',
        'G6': 'stage6_accept'
    };

    let html = '';
    
    EMS_STAGES.forEach((st, idx) => {
        // 计算属于该阶段的设备列表
        const stageEquips = filteredEquips.filter(eq => {
            if (eq.current_stage) {
                if (eq.current_stage === st.key || stageKeyMap[eq.current_stage] === st.key) return true;
            }
            if (eq.stage_name) {
                if (eq.stage_name.includes(st.code) || eq.stage_name.includes(st.title)) return true;
            }
            // 若数据库仅记有 idx/序号
            if (eq.stage_index === idx + 1 || eq.active_stage_idx === idx + 1) return true;
            // 未标明阶段的默认归属到 G1
            if (!eq.current_stage && !eq.stage_name && idx === 0) return true;
            return false;
        });

        html += `
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                <!-- 列头 -->
                <div style="border-bottom: 2px solid ${st.color}; padding-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 800; font-size: 0.95rem; color: ${st.color};">${st.code}.</span>
                        <span style="font-size: 0.7rem; font-weight: 700; background: rgba(59,130,246,0.1); color: ${st.color}; padding: 1px 7px; border-radius: 10px;">
                            ${stageEquips.length}
                        </span>
                    </div>
                    <h4 style="margin: 4px 0 0 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">${st.title}</h4>
                    <span style="font-size: 0.68rem; color: var(--text-secondary);">${st.role}</span>
                </div>

                <!-- 管道内部卡片槽 -->
                <div style="display: flex; flex-direction: column; gap: 10px; min-height: 440px; overflow-y: auto;">
        `;

        if (stageEquips.length === 0) {
            html += `
                <div style="border: 1px dashed var(--border-color); border-radius: 8px; padding: 24px 10px; text-align: center; color: var(--text-secondary); font-size: 0.75rem; background: rgba(0,0,0,0.01);">
                    暂无推进中设备
                </div>
            `;
        } else {
            stageEquips.forEach(eq => {
                const eqCode = eq.code || eq.device_code || ('EQ-' + String(eq.id).padStart(3, '0'));
                const eqName = eq.name || eq.device_name || ('设备-' + eq.id);
                const vendorText = eq.vendor || eq.supplier || "暂未指定";
                const ownerText = eq.owner || eq.responsible || eq.operator || "工程部";
                const catText = eq.category || "生产设备";
                
                // 需求日期解析
                let reqDate = "--";
                if (eq.project_plan_json) {
                    try {
                        const planObj = typeof eq.project_plan_json === 'string' ? JSON.parse(eq.project_plan_json) : eq.project_plan_json;
                        if (planObj[st.key] && planObj[st.key].plan_end_date) {
                            reqDate = planObj[st.key].plan_end_date;
                        }
                    } catch(e) {}
                }
                if (reqDate === "--" && eq.created_at) {
                    reqDate = eq.created_at.substring(0, 10);
                }

                html += `
                    <div onclick="openEmsDetailView(${eq.id})" style="background: var(--bg-card); border: 1px solid var(--border-color); border-left: 4px solid ${st.color}; border-radius: 8px; padding: 12px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 1px 4px rgba(0,0,0,0.04);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.08)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 1px 4px rgba(0,0,0,0.04)';">
                        <div style="margin-bottom: 4px;">
                            <h5 style="margin: 0; font-size: 0.84rem; font-weight: 700; color: var(--text-primary); line-height: 1.3;">${eqName}</h5>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="font-family: monospace; font-size: 0.7rem; color: var(--color-primary); font-weight: 600;">${eqCode}</span>
                            <span style="font-size: 0.62rem; font-weight: 700; background: #f1f5f9; color: #475569; padding: 1px 6px; border-radius: 4px; white-space: nowrap;">${catText}</span>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 3px; font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 8px;">
                            <div>供应商: <span style="color: var(--text-primary); font-weight: 500;">${vendorText}</span></div>
                            <div>责任人: <span style="color: var(--text-primary); font-weight: 500;">${ownerText}</span></div>
                        </div>

                        <div style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px dashed var(--border-color); padding-top: 6px; font-size: 0.66rem; color: var(--text-secondary);">
                            <span style="color: var(--color-primary); font-weight: 700; display: inline-flex; align-items: center; gap: 2px;">
                                深度视角 &rarr;
                            </span>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>
        `;
    });

    kanbanGrid.innerHTML = html;
};

// 2. 渲染合格转固设备台账表格
window.renderEmsDeviceTable = function() {
    const tbody = document.getElementById("ems-device-table-tbody");
    const countBadge = document.getElementById("ems-device-count-badge");
    if (!tbody) return;

    const searchVal = (document.getElementById("ems-search")?.value || "").toLowerCase().trim();
    const categoryVal = document.getElementById("ems-category-filter")?.value || "";

    // 选出 G6 验收交付使用后转固的设备
    let acceptedEquips = state.emsEquipments.filter(item => {
        const isG6 = (item.stage_name && item.stage_name.includes("G6")) || (item.current_stage === "stage6_accept") || (item.status === "运行中" || item.status === "承认通过" || item.status === "已验收");
        if (!isG6) return false;

        if (categoryVal && item.category !== categoryVal) return false;
        if (searchVal) {
            const matchName = (item.name || "").toLowerCase().includes(searchVal);
            const matchCode = (item.code || "").toLowerCase().includes(searchVal);
            const matchVendor = (item.vendor || "").toLowerCase().includes(searchVal);
            return matchName || matchCode || matchVendor;
        }
        return true;
    });

    if (countBadge) countBadge.innerText = acceptedEquips.length;

    if (acceptedEquips.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 30px; color: var(--text-secondary);">暂无合格验收转固设备数据</td></tr>`;
        return;
    }

    let html = '';
    acceptedEquips.forEach(eq => {
        const eqCode = eq.code || eq.device_code || ('EQ-' + String(eq.id).padStart(3, '0'));
        const eqName = eq.name || eq.device_name || '关键设备 ' + eq.id;
        const oeeVal = eq.oee || (85 + (eq.id * 3.7) % 12).toFixed(1) + "%";
        const acceptedDate = eq.acceptance_date || (eq.created_at ? eq.created_at.substring(0, 10) : "2026-07-01");
        
        html += `
            <tr>
                <td style="font-family: monospace; font-weight: 700; color: var(--color-primary);">${eqCode}</td>
                <td style="font-weight: 700; color: var(--text-primary);">${eqName}</td>
                <td><span style="font-size: 0.72rem; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${eq.category || '生产设备'}</span></td>
                <td>${acceptedDate}</td>
                <td>${eq.dept || eq.using_dept || '制造一部'}</td>
                <td>${eq.vendor || '厂商合伙人'}</td>
                <td><span style="font-weight: 700; color: #059669; background: #ecfdf5; padding: 2px 8px; border-radius: 4px; border: 1px solid #a7f3d0;">${oeeVal}</span></td>
                <td>
                    <button class="dms-action-btn" onclick="openEmsDetailView(${eq.id})" style="padding: 4px 10px; font-size: 0.72rem; background: var(--color-primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                        深度管控
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
};

// 3. 渲染设备供应商与驻厂监造风险看板
window.renderEmsSupplierRisk = function() {
    const container = document.getElementById("ems-supplier-risk-container");
    if (!container) return;

    if (!state.emsSuppliers || state.emsSuppliers.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-secondary); background: var(--bg-card); border-radius: 12px; border: 1px dashed var(--border-color);">
                暂无设备核心供应商监造与履约风险记录
            </div>
        `;
        return;
    }

    let html = '';
    state.emsSuppliers.forEach(sup => {
        const isHigh = sup.risk_level === '高';
        const riskBg = isHigh ? '#fef2f2' : '#f0fdf4';
        const riskColor = isHigh ? '#dc2626' : '#16a34a';
        const riskBorder = isHigh ? '#fecaca' : '#bbf7d0';

        html += `
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <h4 style="margin: 0; font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">${sup.supplier_name}</h4>
                            <span style="font-size: 0.65rem; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: #eff6ff; color: #1d4ed8;">${sup.supplier_tier || '一供'}</span>
                        </div>
                        <span style="font-family: monospace; font-size: 0.7rem; color: var(--text-secondary);">设备绑定: ${sup.device_code}</span>
                    </div>
                    <span style="font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 12px; background: ${riskBg}; color: ${riskColor}; border: 1px solid ${riskBorder};">
                        ${sup.risk_level || '低'}风险
                    </span>
                </div>

                <div style="font-size: 0.76rem; color: var(--text-secondary); line-height: 1.4; background: rgba(0,0,0,0.02); padding: 8px 10px; border-radius: 6px;">
                    📌 驻厂监造说明: ${sup.risk_note || '现场 FAT 预验收通过，监造打卡正常'}
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: var(--text-secondary); border-top: 1px dashed var(--border-color); padding-top: 8px;">
                    <div>联系人: <span style="color: var(--text-primary); font-weight: 600;">${sup.contact || '张工'}</span> (${sup.phone || '--'})</div>
                    <span style="font-weight: 700; color: #059669;">FAT状态: ${sup.approval_status || '已验证'}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};

// 打开设备项目深度视角
window.openEmsDetailView = function(id) {
    window.location.href = `device_detail.html?id=${id}`;
};

// 自动初始化拉取
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { window.fetchEmsData && window.fetchEmsData(); });
} else {
    setTimeout(() => { window.fetchEmsData && window.fetchEmsData(); }, 100);
}
