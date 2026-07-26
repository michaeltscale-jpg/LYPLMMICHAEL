// ======================== EMS 设备开发模块 (G1~G6 管道管控视角) ========================

// 核心状态缓存
state.emsEquipments = [];
state.emsActiveTab = 'kanban'; // 'kanban' | 'devices' | 'oee'
state.currentEqId = null;
state.currentEqActiveStageKey = 'stage1_plan';
window.currentEqRole = 'Admin';

// G1~G6 标准阶段解耦常量定义
const EMS_STAGES = [
    { key: "stage1_plan", code: "G1", title: "设备立项中", role: "研发/使用部门", color: "#3b82f6" },
    { key: "stage2_scheme", code: "G2", title: "拟定技术方案", role: "工程部门", color: "#0ea5e9" },
    { key: "stage3_bidding", code: "G3", title: "请购发包中", role: "采购部门", color: "#8b5cf6" },
    { key: "stage4_make", code: "G4", title: "设备制作中", role: "工程/监造组", color: "#f59e0b" },
    { key: "stage5_install", code: "G5", title: "安装调试中", role: "工程/厂务组", color: "#ec4899" },
    { key: "stage6_accept", code: "G6", title: "验收交付使用", role: "使用/资产组", color: "#10b981" }
];

// 切换 EMS 主 Tab
window.switchEmsTab = function(tab) {
    state.emsActiveTab = tab;
    
    const btnKanban = document.getElementById("ems-tab-btn-kanban");
    const btnDev = document.getElementById("ems-tab-btn-devices");
    const btnOee = document.getElementById("ems-tab-btn-oee");
    
    const panelKanban = document.getElementById("ems-panel-kanban");
    const panelDev = document.getElementById("ems-panel-devices");
    const panelOee = document.getElementById("ems-panel-oee");
    
    [btnKanban, btnDev, btnOee].forEach(btn => {
        if (btn) {
            btn.style.borderBottom = "2px solid transparent";
            btn.style.color = "var(--text-secondary)";
        }
    });
    
    [panelKanban, panelDev, panelOee].forEach(panel => {
        if (panel) panel.style.display = "none";
    });

    if (tab === 'kanban') {
        if (btnKanban) { btnKanban.style.borderBottom = "2px solid #2563eb"; btnKanban.style.color = "#2563eb"; }
        if (panelKanban) panelKanban.style.display = "block";
    } else if (tab === 'devices') {
        if (btnDev) { btnDev.style.borderBottom = "2px solid #2563eb"; btnDev.style.color = "#2563eb"; }
        if (panelDev) panelDev.style.display = "block";
    } else if (tab === 'oee') {
        if (btnOee) { btnOee.style.borderBottom = "2px solid #2563eb"; btnOee.style.color = "#2563eb"; }
        if (panelOee) panelOee.style.display = "block";
    }
    renderEmsAll();
};

// 全局拉取 EMS 数据
window.fetchEmsData = function() {
    fetch("/api/equipments")
        .then(r => r.json())
        .then(data => {
            state.emsEquipments = Array.isArray(data) ? data : [];
            renderEmsAll();
        })
        .catch(err => {
            console.error("加载 EMS 设备数据失败:", err);
            if (typeof showToast === 'function') showToast("加载设备数据失败", "error");
        });
};

// 全面统一渲染函数
window.renderEmsAll = function() {
    renderEmsKanban();
    renderEmsDevices();
    renderEmsOee();
};

// 渲染 G1~G6 6列管道看板网格
window.renderEmsKanban = function() {
    const gridContainer = document.getElementById("ems-kanban-grid");
    if (!gridContainer) return;

    const searchVal = (document.getElementById("ems-search")?.value || "").toLowerCase().trim();
    const categoryVal = document.getElementById("ems-category-filter")?.value || "";

    // 过滤符合条件的设备
    const filtered = state.emsEquipments.filter(item => {
        const matchesSearch = !searchVal || 
            (item.name && item.name.toLowerCase().includes(searchVal)) ||
            (item.code && item.code.toLowerCase().includes(searchVal)) ||
            (item.department && item.department.toLowerCase().includes(searchVal));
        const matchesCategory = !categoryVal || (item.category === categoryVal);
        return matchesSearch && matchesCategory;
    });

    let html = "";
    EMS_STAGES.forEach(stage => {
        // 判断哪些设备在该阶段
        const itemsInStage = filtered.filter(item => {
            let stageName = item.stage_name || "G1 设备立项中";
            return stageName.startsWith(stage.code);
        });

        html += `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; display:flex; flex-direction:column; box-shadow:0 1px 3px rgba(0,0,0,0.04); overflow:hidden;">
            <!-- 阶段头部 Header -->
            <div style="padding:10px 12px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="font-weight:800; font-size:0.85rem; color:${stage.color}; margin-right:4px;">${stage.code}.</span>
                    <span style="font-weight:700; font-size:0.8rem; color:#1e293b;">${stage.title}</span>
                    <div style="font-size:0.68rem; color:#64748b; margin-top:2px;">${stage.role}</div>
                </div>
                <span style="background:${stage.color}15; color:${stage.color}; font-weight:700; font-size:0.75rem; padding:2px 8px; border-radius:12px; border:1px solid ${stage.color}30;">
                    ${itemsInStage.length}
                </span>
            </div>

            <!-- 卡片列表内容区 -->
            <div style="padding:10px; flex:1; display:flex; flex-direction:column; gap:10px; overflow-y:auto; max-height:680px; background:#f1f5f930;">
        `;

        if (itemsInStage.length === 0) {
            html += `<div style="text-align:center; padding:30px 10px; color:#94a3b8; font-size:0.75rem; border:1px dashed #cbd5e1; border-radius:8px;">暂无在研设备</div>`;
        } else {
            itemsInStage.forEach(item => {
                let params = {};
                try { params = item.parameters_json ? JSON.parse(item.parameters_json) : {}; } catch(e){}
                
                let reqDate = params.req_date || item.created_at || "--";
                let budget = params.budget || "--";

                html += `
                <div class="ems-kanban-card" onclick="openEquipmentDetailView(${item.id})"
                    style="background:#ffffff; border:1px solid #cbd5e1; border-left:4px solid ${stage.color}; border-radius:8px; padding:12px; cursor:pointer; transition:all 0.2s ease; box-shadow:0 2px 4px rgba(0,0,0,0.03);"
                    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 14px rgba(0,0,0,0.08)';"
                    onmouseout="this.style.transform='none'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.03)';">
                    
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                        <span style="font-weight:700; font-size:0.85rem; color:#0f172a; word-break:break-all;">${item.name}</span>
                        <span style="font-size:0.65rem; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; font-weight:600;">${item.category || '设备'}</span>
                    </div>

                    <div style="font-size:0.72rem; color:#64748b; margin-bottom:8px; font-family:monospace;">
                        ${item.code || 'EQ-UNKNOWN'}
                    </div>

                    <div style="display:flex; flex-direction:column; gap:4px; font-size:0.72rem; color:#334155; margin-bottom:8px; background:#f8fafc; padding:6px 8px; border-radius:4px;">
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:#64748b;">使用单位:</span>
                            <span style="font-weight:600;">${item.department || '--'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:#64748b;">预算:</span>
                            <span style="font-weight:600; color:#2563eb;">${budget}</span>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:6px; font-size:0.7rem;">
                        <span style="color:#94a3b8;">完成日: ${reqDate}</span>
                        <span style="color:#2563eb; font-weight:700; display:flex; align-items:center; gap:2px;">
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

    gridContainer.innerHTML = html;
};

// 渲染转固台帐表格
window.renderEmsDevices = function() {
    const tbody = document.getElementById("ems-devices-tbody");
    if (!tbody) return;

    const categoryVal = document.getElementById("ems-category-filter")?.value || "";
    const searchVal = (document.getElementById("ems-search")?.value || "").toLowerCase().trim();

    // 转固台账只显示处于 G6 验收交付阶段或者已验收的设备
    const acceptedList = state.emsEquipments.filter(item => {
        let stageName = item.stage_name || "";
        const isG6 = stageName.startsWith("G6") || item.status === "已验收";
        const matchesCategory = !categoryVal || (item.category === categoryVal);
        const matchesSearch = !searchVal || 
            (item.name && item.name.toLowerCase().includes(searchVal)) ||
            (item.code && item.code.toLowerCase().includes(searchVal));
        return isG6 && matchesCategory && matchesSearch;
    });

    if (acceptedList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:30px;">暂无验收转固的固定资产设备</td></tr>`;
        return;
    }

    let html = "";
    acceptedList.forEach(item => {
        let params = {};
        try { params = item.parameters_json ? JSON.parse(item.parameters_json) : {}; } catch(e){}
        let oee = params.oee || "92.5%";

        html += `
        <tr>
            <td style="font-family:monospace; font-weight:700; color:#2563eb;">${item.code}</td>
            <td style="font-weight:600;">${item.name}</td>
            <td><span class="badge" style="background:#e0f2fe; color:#0369a1;">${item.category}</span></td>
            <td>${item.acceptance_date || item.created_at || '--'}</td>
            <td>${item.department || '--'}</td>
            <td><span style="font-weight:700; color:#10b981;">${oee}</span></td>
            <td style="text-align:center;">
                <button class="btn-secondary" onclick="openEquipmentDetailView(${item.id})" style="font-size:0.75rem; padding:2px 10px;">
                    深度视角
                </button>
            </td>
        </tr>
        `;
    });
    tbody.innerHTML = html;
};

// 渲染 OEE 维保预警
window.renderEmsOee = function() {
    const oeeBoard = document.getElementById("ems-oee-board");
    if (!oeeBoard) return;

    if (state.emsEquipments.length === 0) {
        oeeBoard.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:40px; grid-column:1/-1;">暂无设备性能与 OEE 监控数据</div>`;
        return;
    }

    let html = "";
    state.emsEquipments.forEach(item => {
        let params = {};
        try { params = item.parameters_json ? JSON.parse(item.parameters_json) : {}; } catch(e){}
        let oee = params.oee || "91.8%";
        let nextMaint = params.next_maintenance || "2026-08-15";

        html += `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-weight:700; font-size:0.9rem; color:#1e293b;">${item.name}</span>
                <span style="font-size:0.7rem; font-family:monospace; background:#f1f5f9; padding:2px 6px; border-radius:4px; color:#475569;">${item.code}</span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; background:#f8fafc; padding:10px; border-radius:8px;">
                <div>
                    <div style="font-size:0.7rem; color:#64748b;">综合效率 (OEE)</div>
                    <div style="font-size:1.1rem; font-weight:800; color:#10b981;">${oee}</div>
                </div>
                <div>
                    <div style="font-size:0.7rem; color:#64748b;">下次计划维保</div>
                    <div style="font-size:0.85rem; font-weight:700; color:#f59e0b; margin-top:4px;">${nextMaint}</div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.75rem; color:#64748b;">所属单位: ${item.department || '--'}</span>
                <button class="btn-secondary" onclick="openEquipmentDetailView(${item.id})" style="font-size:0.72rem; padding:2px 8px;">
                    查看监控线
                </button>
            </div>
        </div>
        `;
    });

    oeeBoard.innerHTML = html;
};

// 打开设备项目深度管控视角 modal 弹窗
window.openEquipmentDetailView = function(eqId) {
    state.currentEqId = eqId;
    const modal = document.getElementById("modal-equipment-detail");
    if (modal) modal.style.display = "flex";
    renderEquipmentDetailView(eqId);
};

// 渲染设备深度视角内容
window.renderEquipmentDetailView = function(eqId) {
    const item = state.emsEquipments.find(e => e.id === eqId);
    if (!item) return;

    // Header 数据初始化
    document.getElementById("eq-detail-title-name").innerText = item.name || "--";
    document.getElementById("eq-detail-title-code").innerText = item.code || "--";
    document.getElementById("eq-detail-title-category").innerText = item.category || "--";
    document.getElementById("eq-detail-title-dept").innerText = item.department || "--";

    let params = {};
    try { params = item.parameters_json ? JSON.parse(item.parameters_json) : {}; } catch(e){}
    let plan = {};
    try { plan = item.project_plan_json ? JSON.parse(item.project_plan_json) : {}; } catch(e){}

    const activeStageKey = state.currentEqActiveStageKey || "stage1_plan";
    const currentStageData = plan[activeStageKey] || {};

    const container = document.getElementById("modal-equipment-detail-body");
    if (!container) return;

    // 1. 构建 G1~G6 Timeline Header 节点 HTML
    let timelineHtml = `<div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:8px; margin-bottom:20px; background:#ffffff; padding:12px; border-radius:10px; border:1px solid #e2e8f0; box-shadow:0 2px 4px rgba(0,0,0,0.02);">`;
    EMS_STAGES.forEach(s => {
        const stageData = plan[s.key] || {};
        const isActive = (s.key === activeStageKey);
        const isDone = stageData.status === "已完成";

        timelineHtml += `
        <div onclick="state.currentEqActiveStageKey='${s.key}'; renderEquipmentDetailView(${eqId});"
            style="padding:10px 8px; border-radius:8px; cursor:pointer; transition:all 0.2s ease; border:2px solid ${isActive ? '#3b82f6' : '#e2e8f0'}; background:${isActive ? '#eff6ff' : '#f8fafc'}; text-align:center;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-weight:800; font-size:0.8rem; color:${s.color};">${s.code}</span>
                <span style="font-size:0.65rem; padding:1px 6px; border-radius:4px; font-weight:700; background:${isDone ? '#dcfce7' : '#fef3c7'}; color:${isDone ? '#166534' : '#92400e'};">
                    ${stageData.status || '进行中'}
                </span>
            </div>
            <div style="font-size:0.75rem; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.title}</div>
            <div style="font-size:0.68rem; color:#64748b; margin-top:2px;">${stageData.owner || s.role}</div>
        </div>
        `;
    });
    timelineHtml += `</div>`;

    // 2. 主体左右分栏布局
    let bodyHtml = `
    ${timelineHtml}
    
    <div style="display:grid; grid-template-columns:3fr 1.2fr; gap:20px;">
        <!-- 左栏：设备基础资料、阶段要点、Inputs/Deliverables 与风险管控 -->
        <div style="display:flex; flex-direction:column; gap:16px;">
            
            <!-- 一、设备基础资料 (离焦自动保存) -->
            <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
                    <h3 style="font-size:0.9rem; font-weight:700; color:#0f172a; margin:0; display:flex; align-items:center; gap:6px;">
                        <i data-lucide="edit-3" style="width:16px;height:16px;color:#3b82f6;"></i> 设备基础属性档案 (编辑离焦自动保存)
                    </h3>
                    <span style="font-size:0.72rem; color:#10b981; font-weight:600;">⚡ 实时静默同步</span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;">
                    <div>
                        <label style="font-size:0.75rem; color:#64748b; font-weight:600; display:block; margin-bottom:4px;">设备名称</label>
                        <input type="text" class="form-control" value="${item.name || ''}" style="font-size:0.8rem;" onblur="autoSaveEquipmentField(${item.id}, 'name', this.value)">
                    </div>
                    <div>
                        <label style="font-size:0.75rem; color:#64748b; font-weight:600; display:block; margin-bottom:4px;">设备代号</label>
                        <input type="text" class="form-control" value="${item.code || ''}" style="font-size:0.8rem; font-family:monospace;" onblur="autoSaveEquipmentField(${item.id}, 'code', this.value)">
                    </div>
                    <div>
                        <label style="font-size:0.75rem; color:#64748b; font-weight:600; display:block; margin-bottom:4px;">设备种类</label>
                        <select class="form-control" style="font-size:0.8rem;" onchange="autoSaveEquipmentField(${item.id}, 'category', this.value)">
                            <option value="生产设备" ${item.category === '生产设备' ? 'selected' : ''}>生产设备</option>
                            <option value="厂务设备" ${item.category === '厂务设备' ? 'selected' : ''}>厂务设备</option>
                            <option value="检测设备" ${item.category === '检测设备' ? 'selected' : ''}>检测设备</option>
                            <option value="仓储搬运设备" ${item.category === '仓储搬运设备' ? 'selected' : ''}>仓储搬运设备</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.75rem; color:#64748b; font-weight:600; display:block; margin-bottom:4px;">预算金额 (万元)</label>
                        <input type="text" class="form-control" value="${params.budget || '120.0 万元'}" style="font-size:0.8rem;" onblur="autoSaveEquipmentParam(${item.id}, 'budget', this.value)">
                    </div>
                    <div>
                        <label style="font-size:0.75rem; color:#64748b; font-weight:600; display:block; margin-bottom:4px;">需求完成日期</label>
                        <input type="date" class="form-control" value="${params.req_date || '2026-08-30'}" style="font-size:0.8rem;" onblur="autoSaveEquipmentParam(${item.id}, 'req_date', this.value)">
                    </div>
                    <div>
                        <label style="font-size:0.75rem; color:#64748b; font-weight:600; display:block; margin-bottom:4px;">使用单位/车间</label>
                        <input type="text" class="form-control" value="${item.department || ''}" style="font-size:0.8rem;" onblur="autoSaveEquipmentField(${item.id}, 'department', this.value)">
                    </div>
                </div>
            </div>

            <!-- 二、当前阶段实施说明 -->
            <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <h3 style="font-size:0.9rem; font-weight:700; color:#0f172a; margin:0;">
                        📌 当前阶段要点说明 (${activeStageKey.toUpperCase()})
                    </h3>
                </div>
                <textarea class="form-control" rows="2" style="font-size:0.8rem; line-height:1.5;" placeholder="输入本阶段的实施计划与特别留意要点..."
                    onblur="saveEmsStageRemark(${item.id}, '${activeStageKey}', this.value)">${currentStageData.remark || ''}</textarea>
            </div>

            <!-- 三、Inputs 输入资料与 Deliverables 交付件 -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                
                <!-- Inputs 输入文件区 -->
                <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:16px;">
                    <h4 style="font-size:0.85rem; font-weight:700; color:#1e293b; margin:0 0 10px; display:flex; align-items:center; gap:6px;">
                        📥 本阶段主题输入资料 (Inputs)
                    </h4>
                    <div style="display:flex; flex-direction:column; gap:6px;">
        `;

    const inputs = currentStageData.input_files || ["《设备采购规格书草案》.docx", "《设备使用现场规划图》.pdf", "《设备投资回报 ROI 分析》.xlsx"];
    inputs.forEach(file => {
        bodyHtml += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:6px 10px; border-radius:6px; border:1px solid #e2e8f0; font-size:0.75rem;">
            <span style="color:#334155; font-weight:600;">${file}</span>
            <button class="btn-secondary" style="font-size:0.68rem; padding:1px 6px;" onclick="previewEmsFile('${file}')">预览</button>
        </div>
        `;
    });

    bodyHtml += `
                    </div>
                </div>

                <!-- Deliverables 交付成果区 -->
                <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:16px;">
                    <h4 style="font-size:0.85rem; font-weight:700; color:#1e293b; margin:0 0 10px; display:flex; align-items:center; gap:6px;">
                        📤 本阶段主题输出交付件 (Deliverables)
                        <span style="font-size:0.65rem; background:#dcfce7; color:#15803d; padding:2px 6px; border-radius:4px;">标准化成果</span>
                    </h4>
                    <div style="display:flex; flex-direction:column; gap:6px;">
    `;

    const deliverables = currentStageData.deliverable_files || ["《设备技术协议(签署版)》.pdf", "《FAT 出厂预验收报告》.pdf", "《设备转固移交清单》.pdf"];
    deliverables.forEach(file => {
        bodyHtml += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#ecfdf5; padding:6px 10px; border-radius:6px; border:1px solid #a7f3d0; font-size:0.75rem;">
            <span style="color:#065f46; font-weight:600;">${file}</span>
            <button class="btn-secondary" style="font-size:0.68rem; padding:1px 6px; background:#fff;" onclick="previewEmsFile('${file}')">查看成果</button>
        </div>
        `;
    });

    bodyHtml += `
                    </div>
                </div>
            </div>

            <!-- 四、进度与质量/成本管控点看板 -->
            <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <h4 style="font-size:0.85rem; font-weight:700; color:#1e293b; margin:0 0 12px; display:flex; align-items:center; gap:6px;">
                    🛡️ 阶段进度与品质/供应链风险管控点
                </h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
                        <div style="font-size:0.72rem; color:#64748b; margin-bottom:4px;">进度管控卡点 (Target Days)</div>
                        <div style="font-size:0.8rem; font-weight:700; color:#1e293b;">
                            ${currentStageData.progress_control?.node || '关键节点会审周期 ≤ 7 天；FAT / SAT 验收按期率 100%'}
                        </div>
                    </div>
                    <div style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
                        <div style="font-size:0.72rem; color:#64748b; margin-bottom:4px;">成本/质保控制手段</div>
                        <div style="font-size:0.8rem; font-weight:700; color:#2563eb;">
                            ${currentStageData.cost_control?.control || '严控设备到厂安装质保押金与付款梯度比例'}
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <!-- 右栏：设备跟进打卡日志与全生命周期时间线 -->
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:16px; display:flex; flex-direction:column; gap:14px; height:fit-content;">
            <h4 style="font-size:0.85rem; font-weight:700; color:#0f172a; margin:0; display:flex; align-items:center; gap:6px;">
                ⏱️ 设备推进打卡日志
            </h4>

            <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                <div style="margin-bottom:8px;">
                    <label style="font-size:0.72rem; color:#64748b; font-weight:600; display:block; margin-bottom:4px;">跟进人</label>
                    <input type="text" id="eq-log-follower" class="form-control" value="李设备" style="font-size:0.8rem;">
                </div>
                <div style="margin-bottom:8px;">
                    <label style="font-size:0.72rem; color:#64748b; font-weight:600; display:block; margin-bottom:4px;">打卡事项 / 跟进进展</label>
                    <textarea id="eq-log-content" class="form-control" rows="3" style="font-size:0.78rem;" placeholder="输入现场监造/安装调试跟进要点..."></textarea>
                </div>
                <button class="btn-primary" style="width:100%; font-size:0.8rem; padding:6px; background:#2563eb;" onclick="addEquipmentFollowupLog(${item.id})">
                    提交跟进打卡
                </button>
            </div>

            <!-- 打卡记录列表 -->
            <div style="display:flex; flex-direction:column; gap:10px; overflow-y:auto; max-height:400px;">
    `;

    let logs = [];
    try { logs = item.followup_logs ? (typeof item.followup_logs === 'string' ? JSON.parse(item.followup_logs) : item.followup_logs) : []; } catch(e){}
    if (!Array.isArray(logs) || logs.length === 0) {
        logs = [
            { date: "2026-07-20", follower: "张工程师", content: "完成设备 FAT 出厂预验收检测，主要机械尺寸符合协议要求。" },
            { date: "2026-07-25", follower: "李工程", content: "设备到厂开箱验货 (IQC)，配件齐全，已安排起重吊装入位。" }
        ];
    }

    logs.forEach(log => {
        bodyHtml += `
        <div style="border-left:3px solid #3b82f6; padding-left:10px; background:#f8fafc; padding:8px 10px; border-radius:0 6px 6px 0;">
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#64748b; margin-bottom:4px;">
                <span style="font-weight:700; color:#1e293b;">${log.follower || '跟进人'}</span>
                <span>${log.date || ''}</span>
            </div>
            <div style="font-size:0.75rem; color:#334155; line-height:1.4;">${log.content || ''}</div>
        </div>
        `;
    });

    bodyHtml += `
            </div>
        </div>
    </div>
    `;

    container.innerHTML = bodyHtml;
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

// 离焦自动保存单个属性
window.autoSaveEquipmentField = function(eqId, fieldName, val) {
    const item = state.emsEquipments.find(e => e.id === eqId);
    if (!item) return;
    item[fieldName] = val;

    fetch("/api/equipments/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
    })
    .then(r => r.json())
    .then(res => {
        if (!res.error) showToast("设备属性已自动更新", "success");
    });
};

// 离焦自动保存 parameters_json 内部属性
window.autoSaveEquipmentParam = function(eqId, paramKey, val) {
    const item = state.emsEquipments.find(e => e.id === eqId);
    if (!item) return;

    let params = {};
    try { params = item.parameters_json ? JSON.parse(item.parameters_json) : {}; } catch(e){}
    params[paramKey] = val;
    item.parameters_json = JSON.stringify(params);

    fetch("/api/equipments/parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eqId, parameters_json: item.parameters_json })
    })
    .then(r => r.json())
    .then(res => {
        if (!res.error) showToast("设备参数点更新成功", "success");
    });
};

// 离焦自动保存阶段备注
window.saveEmsStageRemark = function(eqId, stageKey, remarkVal) {
    const item = state.emsEquipments.find(e => e.id === eqId);
    if (!item) return;

    let plan = {};
    try { plan = item.project_plan_json ? JSON.parse(item.project_plan_json) : {}; } catch(e){}
    if (!plan[stageKey]) plan[stageKey] = {};
    plan[stageKey].remark = remarkVal;
    item.project_plan_json = JSON.stringify(plan);

    fetch("/api/equipments/project_plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eqId, project_plan_json: item.project_plan_json })
    })
    .then(r => r.json())
    .then(res => {
        if (!res.error) showToast("阶段规划要点已自动更新", "success");
    });
};

// 跟进打卡提交
window.addEquipmentFollowupLog = function(eqId) {
    const follower = document.getElementById("eq-log-follower")?.value || "李设备";
    const content = document.getElementById("eq-log-content")?.value || "";

    if (!content.trim()) {
        showToast("请输入打卡跟进内容", "error");
        return;
    }

    const item = state.emsEquipments.find(e => e.id === eqId);
    if (!item) return;

    let logs = [];
    try { logs = item.followup_logs ? JSON.parse(item.followup_logs) : []; } catch(e){}
    const newLog = {
        date: new Date().toISOString().split('T')[0],
        follower: follower,
        content: content
    };
    logs.unshift(newLog);
    item.followup_logs = JSON.stringify(logs);

    fetch("/api/equipments/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
    })
    .then(r => r.json())
    .then(res => {
        showToast("跟进打卡提交成功！", "success");
        document.getElementById("eq-log-content").value = "";
        renderEquipmentDetailView(eqId);
    });
};

// 预览成果
window.previewEmsFile = function(fileName) {
    showToast(`轻量预览: ${fileName}`, "info");
};

// 页面加载自启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { window.fetchEmsData && window.fetchEmsData(); });
} else {
    setTimeout(() => { window.fetchEmsData && window.fetchEmsData(); }, 100);
}
