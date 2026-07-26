// ======================== MQC 物料承认与供应商管理模块 (M1~M6 管道管控视角) ========================

// 核心状态缓存
state.mqcMaterials = [];
state.mqcSuppliers = [];
state.mqcActiveTab = 'kanban'; // 'kanban' | 'materials' | 'risk'
state.currentMqcId = null;
state.currentMqcActiveStageKey = 'stage1_req';
window.currentMqcRole = 'Admin';

// M1~M6 标准阶段常量定义 (防误写解耦结构)
const MQC_STAGES = [
    { key: "stage1_req", code: "M1", title: "物料需求与立项", role: "研发/工艺组", color: "#3b82f6" },
    { key: "stage2_sample", code: "M2", title: "送样与样品初验", role: "实验室/QE", color: "#0ea5e9" },
    { key: "stage3_trial", code: "M3", title: "中试与小批量验证", role: "工艺/制造组", color: "#8b5cf6" },
    { key: "stage4_mass", code: "M4", title: "大批量量产验证", role: "质量部/生产组", color: "#f59e0b" },
    { key: "stage5_audit", code: "M5", title: "现场稽核与双通道", role: "采购/稽核组", color: "#ec4899" },
    { key: "stage6_release", code: "M6", title: "正式承认签发与归档", role: "PLM管理员/技术总监", color: "#10b981" }
];

// 切换 MQC 主 Tab
window.switchMqcTab = function(tab) {
    state.mqcActiveTab = tab;
    
    const btnKanban = document.getElementById("mqc-tab-btn-kanban");
    const btnMat = document.getElementById("mqc-tab-btn-materials");
    const btnRisk = document.getElementById("mqc-tab-btn-risk");
    
    const panelKanban = document.getElementById("mqc-panel-kanban");
    const panelMat = document.getElementById("mqc-panel-materials");
    const panelRisk = document.getElementById("mqc-panel-risk");
    
    [btnKanban, btnMat, btnRisk].forEach(btn => {
        if (btn) {
            btn.style.borderBottom = "2px solid transparent";
            btn.style.color = "var(--text-secondary)";
        }
    });
    
    [panelKanban, panelMat, panelRisk].forEach(panel => {
        if (panel) panel.style.display = "none";
    });

    if (tab === 'kanban') {
        if (btnKanban) { btnKanban.style.borderBottom = "2px solid var(--color-primary)"; btnKanban.style.color = "var(--color-primary)"; }
        if (panelKanban) panelKanban.style.display = "block";
    } else if (tab === 'materials') {
        if (btnMat) { btnMat.style.borderBottom = "2px solid var(--color-primary)"; btnMat.style.color = "var(--color-primary)"; }
        if (panelMat) panelMat.style.display = "block";
    } else if (tab === 'risk') {
        if (btnRisk) { btnRisk.style.borderBottom = "2px solid var(--color-primary)"; btnRisk.style.color = "var(--color-primary)"; }
        if (panelRisk) panelRisk.style.display = "block";
    }

    renderMqcAll();
};

// 拉取 MQC 全量数据
window.fetchMqcData = function() {
    Promise.all([
        fetch("/api/mqc/materials").then(r => r.json()),
        fetch("/api/mqc/suppliers").then(r => r.json())
    ])
    .then(([materials, suppliers]) => {
        state.mqcMaterials = Array.isArray(materials) ? materials : [];
        state.mqcSuppliers = Array.isArray(suppliers) ? suppliers : [];
        renderMqcAll();
    })
    .catch(err => {
        console.error("加载 MQC 数据失败:", err);
        showToast("加载物料承认数据失败", "error");
    });
};

// 渲染当前可见的所有 View
window.renderMqcAll = function() {
    if (state.mqcActiveTab === 'kanban') {
        renderMqcKanban();
    } else if (state.mqcActiveTab === 'materials') {
        renderMqcMaterials();
    } else if (state.mqcActiveTab === 'risk') {
        renderMqcSupplierRisk();
    }
};

// 1. 渲染 M1~M6 阶段管道看板 View
window.renderMqcKanban = function() {
    const grid = document.getElementById("mqc-kanban-grid");
    if (!grid) return;

    const searchVal = (document.getElementById("mqc-search")?.value || "").toLowerCase().trim();
    const catVal = document.getElementById("mqc-category-filter")?.value || "";

    const filtered = state.mqcMaterials.filter(m => {
        const matchSearch = !searchVal || 
            (m.mat_code || "").toLowerCase().includes(searchVal) ||
            (m.mat_name || "").toLowerCase().includes(searchVal) ||
            (m.supplier_name || "").toLowerCase().includes(searchVal);
        const matchCat = !catVal || m.mat_category === catVal;
        return matchSearch && matchCat;
    });

    grid.innerHTML = "";

    MQC_STAGES.forEach(stg => {
        // 匹配处于当前阶段的物料
        const itemsInStage = filtered.filter(m => {
            const curStage = m.stage_name || "M1 物料立项需求";
            return curStage.includes(stg.code) || curStage.includes(stg.title);
        });

        const col = document.createElement("div");
        col.style.cssText = `background: rgba(255,255,255,0.6); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; min-height: 380px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);`;

        let itemsCardsHtml = "";
        if (itemsInStage.length === 0) {
            itemsCardsHtml = `<div style="text-align:center; color:var(--text-muted); font-size:0.75rem; padding:30px 10px; border:1px dashed #cbd5e1; border-radius:8px;">暂无进行中物料</div>`;
        } else {
            itemsCardsHtml = itemsInStage.map(m => {
                let sups = state.mqcSuppliers.filter(s => s.mat_code === m.mat_code);
                let supText = m.supplier_name || (sups[0]?.supplier_name) || "待指定";

                return `
                    <div onclick="openMqcDetailView(${m.id})" 
                         style="background:#ffffff; border:1px solid #e2e8f0; border-left:4px solid ${stg.color}; border-radius:8px; padding:12px; cursor:pointer; transition:all 0.2s ease; box-shadow:0 1px 3px rgba(0,0,0,0.04);"
                         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.08)';"
                         onmouseout="this.style.transform='none'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)';">
                        
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                            <span style="font-weight:700; font-size:0.85rem; color:#0f172a; line-height:1.3;">${m.mat_name}</span>
                            <span class="badge" style="font-size:0.65rem; background:rgba(15,23,42,0.06); color:#475569; padding:1px 5px;">${m.mat_category || '通用'}</span>
                        </div>
                        
                        <div style="font-family:monospace; font-size:0.72rem; color:#64748b; margin-bottom:8px;">${m.mat_code}</div>

                        <div style="font-size:0.75rem; color:#475569; display:flex; flex-direction:column; gap:3px;">
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:#94a3b8;">供应商:</span>
                                <span style="font-weight:600; color:#334155;">${supText}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:#94a3b8;">责任人:</span>
                                <span>${m.apply_by || '张研发'}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:#94a3b8;">状态:</span>
                                <span style="color:${stg.color}; font-weight:600;">${m.status || '正常推进'}</span>
                            </div>
                        </div>

                        <div style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px dashed var(--border-color); padding-top: 6px; font-size: 0.66rem; color: var(--text-secondary);">
                            <span style="color: var(--color-primary); font-weight: 700; display: inline-flex; align-items: center; gap: 2px;">
                                深度视角 &rarr;
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        col.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:2px solid ${stg.color};">
                <div>
                    <div style="font-weight:700; font-size:0.85rem; color:#0f172a; display:flex; align-items:center; gap:4px;">
                        <span style="color:${stg.color}; font-weight:800;">${stg.code}.</span> ${stg.title}
                    </div>
                    <div style="font-size:0.68rem; color:#64748b; margin-top:2px;">${stg.role}</div>
                </div>
                <span class="badge" style="background:${stg.color}15; color:${stg.color}; font-weight:700; font-size:0.75rem;">
                    ${itemsInStage.length}
                </span>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px; flex:1; overflow-y:auto; padding-right:2px;">
                ${itemsCardsHtml}
            </div>
        `;

        grid.appendChild(col);
    });

    if (window.lucide) lucide.createIcons();
};

// 2. 渲染承认合格物料台帐 View
window.renderMqcMaterials = function() {
    const tbody = document.getElementById("mqc-materials-tbody");
    if (!tbody) return;

    const searchVal = (document.getElementById("mqc-search")?.value || "").toLowerCase().trim();
    const catVal = document.getElementById("mqc-category-filter")?.value || "";

    const filtered = state.mqcMaterials.filter(m => {
        const matchSearch = !searchVal || 
            (m.mat_code || "").toLowerCase().includes(searchVal) ||
            (m.mat_name || "").toLowerCase().includes(searchVal) ||
            (m.supplier_name || "").toLowerCase().includes(searchVal);
        const matchCat = !catVal || m.mat_category === catVal;
        return matchSearch && matchCat;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:35px;">暂无匹配的物料承认记录</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    filtered.forEach(m => {
        const sups = state.mqcSuppliers.filter(s => s.mat_code === m.mat_code);
        const has1st = sups.some(s => s.supplier_tier === '一供' && s.status === '活跃');
        const has2nd = sups.some(s => s.supplier_tier === '二供' && s.status === '活跃');
        
        let supBadge = `<span class="badge badge-gray" style="cursor:pointer;" onclick="event.stopPropagation(); openMqcSupplierModal('${m.mat_code}')">无供应商</span>`;
        if (sups.length > 0) {
            if (has1st && has2nd) {
                supBadge = `<span class="badge badge-green" style="cursor:pointer;" onclick="event.stopPropagation(); openMqcSupplierModal('${m.mat_code}')">双通道 (一供+二供)</span>`;
            } else if (has1st) {
                supBadge = `<span class="badge badge-warning" style="cursor:pointer;" onclick="event.stopPropagation(); openMqcSupplierModal('${m.mat_code}')">单一源 (仅一供)</span>`;
            } else {
                supBadge = `<span class="badge badge-danger" style="cursor:pointer;" onclick="event.stopPropagation(); openMqcSupplierModal('${m.mat_code}')">供应异常</span>`;
            }
        }

        let stageBadge = `<span class="badge badge-blue">${m.stage_name || 'M1 物料立项需求'}</span>`;
        if ((m.stage_name || "").includes("M6")) {
            stageBadge = `<span class="badge badge-green">M6 正式承认与归档</span>`;
        }

        let conclusionHtml = `<span style="color:#64748b;">审核中</span>`;
        if (m.conclusion === "通过" || m.status === "承认通过") {
            conclusionHtml = `<span style="color:var(--color-success); font-weight:bold;">✅ 通过</span>`;
        } else if (m.conclusion === "条件通过") {
            conclusionHtml = `<span style="color:var(--color-warning); font-weight:bold;">⚠️ 条件通过</span>`;
        } else if (m.conclusion === "拒绝" || m.status === "承认拒绝") {
            conclusionHtml = `<span style="color:var(--color-danger); font-weight:bold;">❌ 拒绝</span>`;
        }

        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        tr.onclick = () => openMqcDetailView(m.id);
        tr.innerHTML = `
            <td style="font-weight:600; font-family:monospace; color:var(--color-primary);">${m.mat_code}</td>
            <td>
                <div style="font-weight:600; color:#0f172a;">${m.mat_name}</div>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${m.mat_spec || '-'}</div>
            </td>
            <td><span class="badge badge-gray">${m.mat_category || '通用物料'}</span></td>
            <td style="font-weight:600; color:#334155;">${m.supplier_name || '多渠道供货'}</td>
            <td>${stageBadge}</td>
            <td>${conclusionHtml}</td>
            <td>${supBadge}</td>
            <td style="text-align:center;" onclick="event.stopPropagation()">
                <div style="display:flex; gap:6px; justify-content:center;">
                    <button class="btn-xs btn-primary" onclick="openMqcDetailView(${m.id})">深度管控</button>
                    <button class="btn-xs btn-secondary" onclick="openMqcSupplierModal('${m.mat_code}')">供应商 (${sups.length})</button>
                    <button class="btn-xs btn-danger" onclick="deleteMqcMaterial(${m.id})">删除</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
};

// 3. 渲染供应商双通道与风险 View
window.renderMqcSupplierRisk = function() {
    const board = document.getElementById("mqc-risk-board");
    if (!board) return;

    if (state.mqcMaterials.length === 0) {
        board.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:40px; grid-column:1/-1;">暂无物料承认数据，无法生成供应商风险看板。</div>`;
        return;
    }

    board.innerHTML = "";
    state.mqcMaterials.forEach(m => {
        const sups = state.mqcSuppliers.filter(s => s.mat_code === m.mat_code);
        const firstActive = sups.filter(s => s.supplier_tier === '一供' && s.status === '活跃');
        const secondActive = sups.filter(s => s.supplier_tier === '二供' && s.status === '活跃');
        const has1st = firstActive.length > 0;
        const has2nd = secondActive.length > 0;

        let riskColor = "#10b981";
        let riskBg = "rgba(16,185,129,0.06)";
        let riskBorder = "rgba(16,185,129,0.2)";
        let riskText = "低风险 (渠道健全)";
        let riskDesc = "拥有一供和二供，且处于活跃供应状态，供应链通道稳健。";

        if (sups.length === 0) {
            riskColor = "#ef4444"; riskBg = "rgba(239,68,68,0.06)"; riskBorder = "rgba(239,68,68,0.2)";
            riskText = "高风险 (无供应商)"; riskDesc = "当前物料尚未绑定任何供应商，随时面临断料危机！";
        } else if (!has1st) {
            riskColor = "#ef4444"; riskBg = "rgba(239,68,68,0.06)"; riskBorder = "rgba(239,68,68,0.2)";
            riskText = "高风险 (缺失一供)"; riskDesc = "未设置活跃的第一供应商（主供），供应流程不合规。";
        } else if (!has2nd) {
            riskColor = "#f59e0b"; riskBg = "rgba(245,158,11,0.06)"; riskBorder = "rgba(245,158,11,0.2)";
            riskText = "中风险 (单一源-仅一供)"; riskDesc = "仅有单一第一供应商，建议尽快建立第二供应商通道。";
        }

        const card = document.createElement("div");
        card.className = "glass-panel";
        card.style.cssText = `border:1px solid ${riskBorder}; background:${riskBg}; padding:16px; border-radius:10px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;`;

        let supListHtml = sups.map(s => {
            let statusIcon = s.status === '活跃' ? '🟢' : '⏸️';
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; padding:4px 0; border-bottom:1px dashed rgba(0,0,0,0.05);">
                    <span style="font-weight:600; color:#334155;">${statusIcon} ${s.supplier_name}</span>
                    <span class="badge badge-gray" style="font-size:0.68rem;">${s.supplier_tier}</span>
                </div>
            `;
        }).join('') || `<div style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">暂无关联供应商</div>`;

        card.innerHTML = `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <h4 style="font-size:0.95rem; font-weight:700; color:#0f172a;">${m.mat_name}</h4>
                        <span style="font-family:monospace; font-size:0.75rem; color:#64748b;">${m.mat_code}</span>
                    </div>
                    <span style="font-size:0.7rem; font-weight:bold; color:${riskColor}; border:1px solid ${riskColor}50; padding:2px 6px; border-radius:4px; background:${riskColor}10;">
                        ${riskText}
                    </span>
                </div>
                <p style="font-size:0.75rem; color:#475569; margin-bottom:12px; line-height:1.4;">${riskDesc}</p>
                <div style="background:rgba(255,255,255,0.7); border-radius:6px; padding:10px; border:1px solid #e2e8f0;">
                    <div style="font-size:0.7rem; font-weight:bold; color:#64748b; margin-bottom:6px;">通道渠道分布</div>
                    ${supListHtml}
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end;">
                <button class="btn-xs btn-outline" onclick="openMqcSupplierModal('${m.mat_code}')" style="font-size:0.7rem;">
                    管理供应商渠道
                </button>
            </div>
        `;
        board.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
};

// 4. 打开新增物料承认申请 Modal
window.openMqcCreateModal = function() {
    document.getElementById("mqc-create-id").value = "";
    document.getElementById("mqc-create-code").value = "MAT-" + Math.floor(100 + Math.random() * 900);
    document.getElementById("mqc-create-name").value = "";
    document.getElementById("mqc-create-category").value = "添加剂";
    document.getElementById("mqc-create-supplier").value = "";
    document.getElementById("mqc-create-spec").value = "";
    document.getElementById("mqc-create-purpose").value = "";
    document.getElementById("mqc-create-reason").value = "";
    document.getElementById("mqc-create-budget").value = "50.0";
    
    const d = new Date();
    d.setDate(d.getDate() + 30);
    document.getElementById("mqc-create-required-date").value = d.toISOString().split('T')[0];

    openModal("modal-mqc-create");
};

// 5. 提交新增物料承认申请表
window.submitMqcCreate = function() {
    const mat_code = document.getElementById("mqc-create-code").value.trim();
    const mat_name = document.getElementById("mqc-create-name").value.trim();
    const mat_category = document.getElementById("mqc-create-category").value;

    if (!mat_code || !mat_name) {
        showToast("请填写物料代码与物料名称！", "error");
        return;
    }

    const bodyData = {
        mat_code: mat_code,
        mat_name: mat_name,
        mat_category: mat_category,
        mat_spec: document.getElementById("mqc-create-spec").value.trim(),
        supplier_name: document.getElementById("mqc-create-supplier").value.trim(),
        apply_by: document.getElementById("mqc-create-apply-by").value,
        material_purpose: document.getElementById("mqc-create-purpose").value.trim(),
        proposal_reason: document.getElementById("mqc-create-reason").value.trim(),
        estimated_budget: document.getElementById("mqc-create-budget").value,
        required_date: document.getElementById("mqc-create-required-date").value,
        using_unit: document.getElementById("mqc-create-using-unit").value.trim(),
        stage_name: "M1 物料立项需求",
        status: "正常推进"
    };

    fetch("/api/mqc/materials/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
    })
    .then(r => r.json())
    .then(res => {
        if (res.error) {
            showToast(res.error, "error");
        } else {
            showToast("物料承认立项申请表已成功提交！", "success");
            closeModal("modal-mqc-create");
            fetchMqcData();
        }
    })
    .catch(err => {
        console.error("提交物料承认立项失败:", err);
        showToast("提交物料承认立项失败", "error");
    });
};

// 6. 打开物料项目深度管控视角 Modal
window.openMqcDetailView = function(matId) {
    state.currentMqcId = matId;
    openModal("modal-mqc-detail");
    renderMqcDetailView(matId);
};

// 7. 渲染物料深度管控视角主体
window.renderMqcDetailView = function(matId) {
    const body = document.getElementById("mqc-detail-body");
    if (!body) return;

    fetch(`/api/mqc/material/detail?id=${matId}`)
    .then(r => r.json())
    .then(mat => {
        if (!mat || mat.error) {
            body.innerHTML = `<div style="text-align:center; padding:50px; color:var(--text-muted);">未查找到该物料详情信息</div>`;
            return;
        }

        // 更新 Modal 顶部 Header 信息
        document.getElementById("mqc-detail-title-name").innerText = mat.mat_name || "未命名物料";
        document.getElementById("mqc-detail-title-code").innerText = mat.mat_code || "-";
        document.getElementById("mqc-detail-title-category").innerText = mat.mat_category || "通用";
        document.getElementById("mqc-detail-title-supplier").innerText = mat.supplier_name || "待绑定";

        // 解析 JSON 数据
        let plan = {};
        let params = {};
        try { plan = JSON.parse(mat.project_plan_json || '{}'); } catch(e) { plan = {}; }
        try { params = JSON.parse(mat.parameters_json || '{}'); } catch(e) { params = {}; }

        // 当前选中的阶段
        const activeStageKey = state.currentMqcActiveStageKey || 'stage1_req';
        const currentStageData = plan[activeStageKey] || {};

        // 渲染 6 大阶段 Header 里程碑管道线 (Timeline Grid)
        let timelineHtml = `
            <div style="display:grid; grid-template-columns:repeat(6, minmax(0, 1fr)); gap:10px; margin-bottom:20px;">
        `;

        MQC_STAGES.forEach((stg, idx) => {
            const stgData = plan[stg.key] || {};
            const isSelected = (stg.key === activeStageKey);
            const isFinished = (stgData.status === "已完成");
            const isInProgress = (stgData.status === "进行中");

            let borderStyle = isSelected ? `2px solid ${stg.color}` : `1px solid #cbd5e1`;
            let bgStyle = isSelected ? `linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)` : `#ffffff`;
            let statusBadge = isFinished ? `<span style="color:#10b981; font-weight:700;">已完成</span>` : (isInProgress ? `<span style="color:#3b82f6; font-weight:700;">进行中</span>` : `<span style="color:#94a3b8;">未开始</span>`);

            timelineHtml += `
                <div onclick="state.currentMqcActiveStageKey='${stg.key}'; renderMqcDetailView(${matId});"
                     style="border:${borderStyle}; background:${bgStyle}; border-radius:8px; padding:10px 12px; cursor:pointer; transition:all 0.2s; box-shadow:${isSelected ? '0 4px 12px rgba(16,185,129,0.15)' : 'none'};">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:0.75rem; font-weight:800; color:${stg.color};">${stg.code}</span>
                        <span style="font-size:0.7rem;">${statusBadge}</span>
                    </div>
                    <div style="font-size:0.82rem; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${stg.title}</div>
                    <div style="font-size:0.7rem; color:#64748b; margin-top:4px;">计划完成: ${stgData.end_date || '----'}</div>
                    <div style="font-size:0.7rem; color:#94a3b8; margin-top:2px;">👤 ${stgData.owner || stg.role}</div>
                </div>
            `;
        });
        timelineHtml += `</div>`;

        // 主体双栏内容 (Left 72% / Right 28%)
        const inputs = currentStageData.input_files || [];
        const deliverables = currentStageData.deliverable_files || [];
        const progressCtrl = currentStageData.progress_control || {};
        const costCtrl = currentStageData.cost_control || {};
        const logs = params.followup_logs || [];

        let inputsHtml = inputs.map(f => `
            <div style="background:#ffffff; border:1px dashed #cbd5e1; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.78rem; color:#334155; font-weight:600;">📄 ${f}</span>
                <button class="btn-xs btn-outline" onclick="previewMqcFile('${f}')" style="font-size:0.7rem; padding:2px 8px;">预览</button>
            </div>
        `).join('');

        let deliverablesHtml = deliverables.map(f => `
            <div style="background:#f0fdf4; border:1px solid #a7f3d0; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="font-size:0.78rem; color:#065f46; font-weight:700;">📦 ${f}</span>
                    <span class="badge badge-green" style="font-size:0.65rem; margin-left:6px;">标准化成果</span>
                </div>
                <button class="btn-xs btn-primary" onclick="previewMqcFile('${f}')" style="font-size:0.7rem; padding:2px 8px;">预览成果</button>
            </div>
        `).join('');

        let logsHtml = logs.slice().reverse().map(l => `
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #10b981; border-radius:6px; padding:10px 12px; margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span class="badge badge-gray" style="font-size:0.68rem;">${l.stage_tag || '跟进打卡'}</span>
                    <span style="font-size:0.7rem; color:#94a3b8;">${l.date}</span>
                </div>
                <div style="font-size:0.78rem; color:#334155; line-height:1.4;">${l.content}</div>
                <div style="font-size:0.7rem; color:#64748b; text-align:right; margin-top:4px;">打卡人: ${l.follower || '系统'}</div>
            </div>
        `).join('') || `<div style="text-align:center; color:#94a3b8; font-size:0.75rem; padding:20px;">暂无跟进打卡日志</div>`;

        body.innerHTML = `
            ${timelineHtml}

            <div style="display:grid; grid-template-columns: 2.6fr 1fr; gap:16px;">
                
                <!-- 左侧主体 72% -->
                <div style="display:flex; flex-direction:column; gap:16px;">
                    
                    <!-- 卡片一：物料基础资料 (离焦自动保存) -->
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
                            <span style="font-weight:700; font-size:0.9rem; color:#0f172a; display:flex; align-items:center; gap:6px;">
                                <i data-lucide="edit-3" style="width:16px;height:16px;color:#10b981;"></i>
                                一、物料基础资料 (在线可编辑·离焦自动保存)
                            </span>
                            <span style="font-size:0.72rem; color:#10b981; font-weight:600;">✍️ 修改栏位离焦即自动保存</span>
                        </div>
                        
                        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:12px;">
                            <div>
                                <label style="font-size:0.75rem; color:#64748b;">物料名称</label>
                                <input type="text" class="form-control" value="${mat.mat_name || ''}" style="font-size:0.8rem;" onchange="autoSaveMqcField(${matId}, 'mat_name', this.value)">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#64748b;">物料代码</label>
                                <input type="text" class="form-control" value="${mat.mat_code || ''}" style="font-size:0.8rem; font-family:monospace;" onchange="autoSaveMqcField(${matId}, 'mat_code', this.value)">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#64748b;">物料大类</label>
                                <select class="form-control" style="font-size:0.8rem;" onchange="autoSaveMqcField(${matId}, 'mat_category', this.value)">
                                    <option value="氧化铜粉" ${mat.mat_category==='氧化铜粉'?'selected':''}>氧化铜粉</option>
                                    <option value="添加剂" ${mat.mat_category==='添加剂'?'selected':''}>添加剂</option>
                                    <option value="辅料" ${mat.mat_category==='辅料'?'selected':''}>辅料</option>
                                    <option value="基材" ${mat.mat_category==='基材'?'selected':''}>基材</option>
                                    <option value="靶材" ${mat.mat_category==='靶材'?'selected':''}>靶材</option>
                                    <option value="药水" ${mat.mat_category==='药水'?'selected':''}>药水</option>
                                    <option value="包材" ${mat.mat_category==='包材'?'selected':''}>包材</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#64748b;">主要供应商</label>
                                <input type="text" class="form-control" value="${mat.supplier_name || ''}" style="font-size:0.8rem;" onchange="autoSaveMqcField(${matId}, 'supplier_name', this.value)">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#64748b;">预估年采购预算 (万元)</label>
                                <input type="number" class="form-control" value="${params.estimated_budget || '50.0'}" style="font-size:0.8rem;" onchange="autoSaveMqcParam(${matId}, 'estimated_budget', this.value)">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#64748b;">需求完成日期</label>
                                <input type="date" class="form-control" value="${params.required_date || ''}" style="font-size:0.8rem;" onchange="autoSaveMqcParam(${matId}, 'required_date', this.value)">
                            </div>
                            <div style="grid-column: 1/-1;">
                                <label style="font-size:0.75rem; color:#64748b;">物料用途与承认背景说明</label>
                                <input type="text" class="form-control" value="${params.material_purpose || ''}" style="font-size:0.8rem;" onchange="autoSaveMqcParam(${matId}, 'material_purpose', this.value)">
                            </div>
                        </div>
                    </div>

                    <!-- 卡片二：阶段计划与实施要点 (焦点离开自动保存) -->
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px;">
                        <div style="font-weight:700; font-size:0.88rem; color:#0f172a; margin-bottom:8px; display:flex; justify-content:space-between;">
                            <span>二、${currentStageData.title || '当前阶段'} 计划说明与实施规划要点</span>
                            <span style="font-size:0.72rem; color:#10b981; font-weight:600;">✍️ 在线编辑焦点自动保存</span>
                        </div>
                        <textarea class="form-control" rows="2" style="font-size:0.8rem;" 
                                  placeholder="请输入当前阶段的跟进说明要点与推进安排..." 
                                  onchange="saveMqcStageRemark(${matId}, '${activeStageKey}', this.value)">${currentStageData.remark || ''}</textarea>
                    </div>

                    <!-- 卡片三：阶段输入资料 (Inputs) -->
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px;">
                        <div style="font-weight:700; font-size:0.88rem; color:#0f172a; margin-bottom:10px;">
                            三、本阶段主题输入资料 (Inputs)
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            ${inputsHtml}
                        </div>
                    </div>

                    <!-- 卡片四：阶段输出交付件 (Deliverables) -->
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px;">
                        <div style="font-weight:700; font-size:0.88rem; color:#0f172a; margin-bottom:10px;">
                            四、本阶段主题输出交付件 (Deliverables)
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            ${deliverablesHtml}
                        </div>
                    </div>

                    <!-- 卡片五：进度与品质/供应链风险管控点 -->
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px;">
                        <div style="font-weight:700; font-size:0.88rem; color:#0f172a; margin-bottom:12px;">
                            五、进度与品质/供应链风险管控点
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                                <div style="font-size:0.75rem; font-weight:700; color:#3b82f6; margin-bottom:4px;">⏱️ 进度管控要点</div>
                                <div style="font-size:0.78rem; color:#334155; margin-bottom:4px;">目标工期：<strong>${progressCtrl.target_days || 7} 天</strong></div>
                                <div style="font-size:0.75rem; color:#64748b;">${progressCtrl.node || '暂无要求'}</div>
                                <div style="margin-top:6px;"><span class="badge badge-green">${progressCtrl.status_text || '进度正常'}</span></div>
                            </div>

                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                                <div style="font-size:0.75rem; font-weight:700; color:#ec4899; margin-bottom:4px;">🛡️ 品质/成本与双通道风险管控</div>
                                <div style="font-size:0.78rem; color:#334155; margin-bottom:4px;">预算: <strong>${costCtrl.budget || '50.0万元'}</strong> (实际: ${costCtrl.actual || '0万元'})</div>
                                <div style="font-size:0.75rem; color:#64748b;">${costCtrl.control || '严格把控质量风险'}</div>
                            </div>
                        </div>
                    </div>

                </div>

                <!-- 右侧跟进打卡卡片 28% -->
                <div style="display:flex; flex-direction:column; gap:16px;">
                    
                    <!-- 新增跟进打卡 -->
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px;">
                        <div style="font-weight:700; font-size:0.88rem; color:#0f172a; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                            📌 新增物料跟进打卡
                        </div>
                        
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <div>
                                <label style="font-size:0.72rem; color:#64748b;">跟进日期</label>
                                <input type="date" id="mqc-log-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" style="font-size:0.78rem;">
                            </div>
                            <div>
                                <label style="font-size:0.72rem; color:#64748b;">跟进人</label>
                                <select id="mqc-log-follower" class="form-control" style="font-size:0.78rem;">
                                    <option value="张研发 (物料责任人)">张研发 (物料责任人)</option>
                                    <option value="陈品质 (IQC组)">陈品质 (IQC组)</option>
                                    <option value="王工艺">王工艺</option>
                                    <option value="李采购">李采购</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size:0.72rem; color:#64748b;">跟进内容与事项说明</label>
                                <textarea id="mqc-log-content" class="form-control" rows="3" placeholder="录入阶段推进打卡事项、问题或指示要点..." style="font-size:0.78rem;"></textarea>
                            </div>
                            <button class="btn-primary" onclick="addMqcFollowupLog(${matId})" style="font-size:0.8rem; margin-top:4px;">
                                提交跟进打卡
                            </button>
                        </div>
                    </div>

                    <!-- 历史跟进记录时间线 -->
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px; flex:1;">
                        <div style="font-weight:700; font-size:0.88rem; color:#0f172a; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                            <span>📍 历史跟进日志时间线</span>
                            <span class="badge badge-blue" style="font-size:0.7rem;">${logs.length} 条记录</span>
                        </div>
                        <div style="max-height:480px; overflow-y:auto; padding-right:4px;">
                            ${logsHtml}
                        </div>
                    </div>

                </div>

            </div>
        `;

        if (window.lucide) lucide.createIcons();
    })
    .catch(err => {
        console.error("加载物料详情失败:", err);
        body.innerHTML = `<div style="text-align:center; padding:50px; color:#ef4444;">加载物料详情异常</div>`;
    });
};

// 离焦自动保存主物料字段
window.autoSaveMqcField = function(matId, fieldName, value) {
    const bodyData = { id: matId };
    bodyData[fieldName] = value;

    fetch("/api/mqc/materials/parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
    })
    .then(r => r.json())
    .then(res => {
        if (res.ok) {
            showToast(`已自动保存: ${fieldName}`, "success");
            fetchMqcData();
        }
    });
};

// 离焦自动保存 parameters_json 扩展属性
window.autoSaveMqcParam = function(matId, paramKey, value) {
    fetch(`/api/mqc/material/detail?id=${matId}`)
    .then(r => r.json())
    .then(mat => {
        let params = {};
        try { params = JSON.parse(mat.parameters_json || '{}'); } catch(e) {}
        params[paramKey] = value;

        fetch("/api/mqc/materials/parameters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: matId, parameters_json: params })
        })
        .then(r => r.json())
        .then(res => {
            if (res.ok) showToast("参数已实时保存", "success");
        });
    });
};

// 离焦保存阶段计划 remark
window.saveMqcStageRemark = function(matId, stageKey, remark) {
    fetch(`/api/mqc/material/detail?id=${matId}`)
    .then(r => r.json())
    .then(mat => {
        let plan = {};
        try { plan = JSON.parse(mat.project_plan_json || '{}'); } catch(e) {}
        if (plan[stageKey]) {
            plan[stageKey].remark = remark;
        }

        fetch("/api/mqc/materials/project_plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: matId, project_plan_json: JSON.stringify(plan) })
        })
        .then(r => r.json())
        .then(res => {
            if (res.ok) showToast("阶段实施计划要点已自动保存", "success");
        });
    });
};

// 提交跟进打卡日志
window.addMqcFollowupLog = function(matId) {
    const date = document.getElementById("mqc-log-date").value;
    const follower = document.getElementById("mqc-log-follower").value;
    const content = document.getElementById("mqc-log-content").value.trim();

    if (!content) {
        showToast("请输入打卡跟进事项内容！", "warning");
        return;
    }

    fetch(`/api/mqc/material/detail?id=${matId}`)
    .then(r => r.json())
    .then(mat => {
        let params = {};
        try { params = JSON.parse(mat.parameters_json || '{}'); } catch(e) {}
        if (!Array.isArray(params.followup_logs)) params.followup_logs = [];

        params.followup_logs.push({
            id: Date.now(),
            date: date,
            stage_tag: mat.stage_name || "阶段推进",
            follower: follower,
            content: content
        });

        fetch("/api/mqc/materials/parameters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: matId, parameters_json: params })
        })
        .then(r => r.json())
        .then(res => {
            if (res.ok) {
                showToast("物料跟进打卡记录成功！", "success");
                renderMqcDetailView(matId);
            }
        });
    });
};

// 轻量文件预览 Modal 提示
window.previewMqcFile = function(fileName) {
    alert(`【文件预览】\n文件名: ${fileName}\n状态: 受控加密预览模式已开启`);
};

// 删除物料承认记录
window.deleteMqcMaterial = function(id) {
    if (!confirm("确定要删除该物料承认记录及其绑定的所有供应商通道吗？此操作不可逆！")) return;

    fetch("/api/mqc/materials/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id })
    })
    .then(r => r.json())
    .then(res => {
        if (res.ok) {
            showToast("物料承认记录已成功删除", "success");
            fetchMqcData();
        }
    });
};

// 供应商 Modal 相关保持兼容
window.openMqcSupplierModal = function(matCode) {
    const mat = state.mqcMaterials.find(m => m.mat_code === matCode);
    if (!mat) return;
    document.getElementById("mqc-supplier-mat-label").innerText = `${mat.mat_name} (${mat.mat_code})`;
    document.getElementById("mqc-sup-mat-code").value = matCode;
    resetMqcSupForm();
    renderMqcSupplierList(matCode);
    openModal("modal-mqc-supplier");
};

window.resetMqcSupForm = function() {
    document.getElementById("mqc-sup-id").value = "";
    document.getElementById("mqc-sup-name").value = "";
    document.getElementById("mqc-sup-tier").value = "一供";
    document.getElementById("mqc-sup-contact").value = "";
    document.getElementById("mqc-sup-phone").value = "";
    document.getElementById("mqc-sup-risk").value = "中";
    document.getElementById("mqc-sup-status").value = "活跃";
    document.getElementById("mqc-sup-approved-date").value = new Date().toISOString().split('T')[0];
    document.getElementById("mqc-sup-risk-note").value = "";
};

function renderMqcSupplierList(matCode) {
    const listDiv = document.getElementById("mqc-supplier-list");
    if (!listDiv) return;
    const sups = state.mqcSuppliers.filter(s => s.mat_code === matCode);
    if (sups.length === 0) {
        listDiv.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.75rem; padding:15px; border:1px dashed var(--border-color); border-radius:6px;">暂未注册任何一供/二供供应商！</div>`;
        return;
    }
    listDiv.innerHTML = "";
    sups.forEach(s => {
        const row = document.createElement("div");
        row.style.cssText = "background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:6px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;";
        row.innerHTML = `
            <div>
                <strong style="font-size:0.85rem; color:var(--text-main);">${s.supplier_name}</strong>
                <span class="badge badge-gray" style="font-size:0.65rem; margin-left:6px;">${s.supplier_tier}</span>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:4px;">联系方式: ${s.contact || '无'} (${s.phone || '无'})</div>
            </div>
            <button class="btn-xs btn-danger" onclick="deleteMqcSupplier(${s.id})">删除</button>
        `;
        listDiv.appendChild(row);
    });
}

window.saveMqcSupplier = function() {
    const mat_code = document.getElementById("mqc-sup-mat-code").value;
    const name = document.getElementById("mqc-sup-name").value.trim();
    if (!name) { showToast("请输入供应商名称！", "error"); return; }
    
    fetch("/api/mqc/suppliers/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
    })
    .then(r => r.json())
    .then(res => {
        if (res.error) {
            showToast(res.error, "error");
        } else {
            showToast("供应商信息已成功保存！", "success");
            resetMqcSupForm();
            // 重新拉取并局部刷新
            Promise.all([
                fetch("/api/mqc/materials").then(r => r.json()),
                fetch("/api/mqc/suppliers").then(r => r.json())
            ]).then(([materials, suppliers]) => {
                state.mqcMaterials = materials;
                state.mqcSuppliers = suppliers;
                renderMqcMaterials();
                renderMqcSupplierList(mat_code);
            });
        }
    })
    .catch(err => {
        console.error("保存供应商失败:", err);
        showToast("保存供应商失败", "error");
    });
};

// 删除供应商
window.deleteMqcSupplier = function(id) {
    if (!confirm("确定要删除该供应商渠道吗？该操作不可撤销。")) {
        return;
    }
    
    const mat_code = document.getElementById("mqc-sup-mat-code").value;
    
    fetch("/api/mqc/suppliers/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id })
    })
    .then(r => r.json())
    .then(res => {
        if (res.error) {
            showToast(res.error, "error");
        } else {
            showToast("供应商渠道已成功删除！", "success");
            // 重新拉取并局部刷新
            Promise.all([
                fetch("/api/mqc/materials").then(r => r.json()),
                fetch("/api/mqc/suppliers").then(r => r.json())
            ]).then(([materials, suppliers]) => {
                state.mqcMaterials = materials;
                state.mqcSuppliers = suppliers;
                renderMqcMaterials();
                renderMqcSupplierList(mat_code);
            });
        }
    })
    .catch(err => {
        console.error("删除供应商失败:", err);
        showToast("删除供应商失败", "error");
    });
};

// 初始化自动拉取与渲染
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { window.fetchMqcData && window.fetchMqcData(); });
} else {
    setTimeout(() => { window.fetchMqcData && window.fetchMqcData(); }, 100);
}
