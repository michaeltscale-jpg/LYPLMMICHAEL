    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// ======================== MQC 物料承认与供应商管理模块 ========================

// MQC 状态与数据缓存
state.mqcMaterials = [];
state.mqcSuppliers = [];
state.mqcActiveTab = 'materials'; // 'materials' | 'risk'

// 切换 MQC 子 Tab
window.switchMqcTab = function(tab) {
    state.mqcActiveTab = tab;
    
    // 更新 Tab 按钮样式
    const btnMat = document.getElementById("mqc-tab-btn-materials");
    const btnRisk = document.getElementById("mqc-tab-btn-risk");
    const panelMat = document.getElementById("mqc-panel-materials");
    const panelRisk = document.getElementById("mqc-panel-risk");
    
    if (tab === 'materials') {
        btnMat.style.borderBottom = "2px solid var(--color-primary)";
        btnMat.style.color = "var(--color-primary)";
        btnRisk.style.borderBottom = "2px solid transparent";
        btnRisk.style.color = "var(--text-secondary)";
        panelMat.style.display = "block";
        panelRisk.style.display = "none";
    } else {
        btnRisk.style.borderBottom = "2px solid var(--color-primary)";
        btnRisk.style.color = "var(--color-primary)";
        btnMat.style.borderBottom = "2px solid transparent";
        btnMat.style.color = "var(--text-secondary)";
        panelMat.style.display = "none";
        panelRisk.style.display = "block";
        renderMqcSupplierRisk();
    }
};

// 加载 MQC 所有数据
window.fetchMqcData = function() {
    Promise.all([
        fetch("/api/mqc/materials").then(r => r.json()),
        fetch("/api/mqc/suppliers").then(r => r.json())
    ])
    .then(([materials, suppliers]) => {
        state.mqcMaterials = materials;
        state.mqcSuppliers = suppliers;
        
        renderMqcMaterials();
        if (state.mqcActiveTab === 'risk') {
            renderMqcSupplierRisk();
        }
    })
    .catch(err => {
        console.error("加载 MQC 数据失败:", err);
        showToast("加载物料承认数据失败", "error");
    });
};

// 渲染物料承认台帐列表
window.renderMqcMaterials = function() {
    const tbody = document.getElementById("mqc-materials-tbody");
    if (!tbody) return;
    
    const searchVal = (document.getElementById("mqc-search")?.value || "").toLowerCase().trim();
    
    // 过滤数据
    const filtered = state.mqcMaterials.filter(m => {
        return (m.mat_code || "").toLowerCase().includes(searchVal) ||
               (m.mat_name || "").toLowerCase().includes(searchVal) ||
               (m.mat_spec || "").toLowerCase().includes(searchVal);
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:30px;">暂无匹配的物料承认记录</td></tr>`;
        return;
    }
    
    tbody.innerHTML = "";
    filtered.forEach(m => {
        // 查找该物料关联的供应商列表
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

        // 承认状态徽章
        let statusHtml = "";
        if (m.status === "需求提出") {
            statusHtml = `<span class="badge badge-gray">📋 需求提出</span>`;
        } else if (m.status === "样品到达") {
            statusHtml = `<span class="badge" style="background:rgba(14,165,233,0.1); color:#0ea5e9;">📦 样品到达</span>`;
        } else if (m.status === "测试中") {
            statusHtml = `<span class="badge badge-blue">🔬 测试中</span>`;
        } else if (m.status === "承认通过") {
            statusHtml = `<span class="badge badge-green">✅ 承认通过</span>`;
        } else if (m.status === "承认拒绝") {
            statusHtml = `<span class="badge badge-danger">❌ 承认拒绝</span>`;
        } else {
            statusHtml = `<span class="badge badge-gray">${m.status || '需求提出'}</span>`;
        }

        // 承认结论
        let conclusionHtml = "-";
        if (m.conclusion === "通过") {
            conclusionHtml = `<span style="color:var(--color-success); font-weight:bold;">通过</span>`;
        } else if (m.conclusion === "条件通过") {
            conclusionHtml = `<span style="color:var(--color-warning); font-weight:bold;">条件通过</span>`;
        } else if (m.conclusion === "拒绝") {
            conclusionHtml = `<span style="color:var(--color-danger); font-weight:bold;">拒绝</span>`;
        }

        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        tr.onclick = () => openMqcMaterialModal(m.id);
        tr.innerHTML = `
            <td style="font-weight:600; font-family:monospace;">${m.mat_code}</td>
            <td>
                <div style="font-weight:600;">${m.mat_name}</div>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${m.mat_spec || '-'}</div>
            </td>
            <td><span class="badge badge-gray">${m.mat_category || '其他'}</span></td>
            <td>${m.apply_by || '-'}</td>
            <td style="font-family:monospace; font-size:0.75rem;">${m.apply_date || '-'}</td>
            <td>${statusHtml}</td>
            <td>${conclusionHtml}</td>
            <td>${supBadge}</td>
            <td style="text-align:center;" onclick="event.stopPropagation()">
                <div style="display:flex; gap:6px; justify-content:center;">
                    <button class="btn-xs btn-outline" onclick="openMqcMaterialModal(${m.id})">编辑</button>
                    <button class="btn-xs btn-secondary" onclick="openMqcSupplierModal('${m.mat_code}')">供应商 (${sups.length})</button>
                    <button class="btn-xs btn-danger" onclick="deleteMqcMaterial(${m.id})">删除</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons({
        attrs: { "stroke-width": 1.8 },
        nameAttr: "data-lucide",
        node: tbody
    });
};

// 渲染供应商风险看板
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
        const backupActive = sups.filter(s => s.supplier_tier === '备供' && s.status === '活跃');
        
        const has1st = firstActive.length > 0;
        const has2nd = secondActive.length > 0;
        
        let riskColor = "var(--color-success)";
        let riskBg = "rgba(16,185,129,0.06)";
        let riskBorder = "rgba(16,185,129,0.2)";
        let riskText = "低风险 (渠道健全)";
        let riskDesc = "拥有一供和二供，且处于活跃供应状态，供应链通道稳健。";
        
        // 判定逻辑
        if (sups.length === 0) {
            riskColor = "#ef4444";
            riskBg = "rgba(239,68,68,0.06)";
            riskBorder = "rgba(239,68,68,0.2)";
            riskText = "高风险 (无供应商)";
            riskDesc = "当前物料尚未绑定任何供应商，随时面临断料危机！";
        } else if (!has1st) {
            riskColor = "#ef4444";
            riskBg = "rgba(239,68,68,0.06)";
            riskBorder = "rgba(239,68,68,0.2)";
            riskText = "高风险 (缺失一供)";
            riskDesc = "未设置活跃的第一供应商（主供），供应流程不合规。";
        } else {
            const suspended1st = sups.some(s => s.supplier_tier === '一供' && s.status === '暂停');
            
            if (suspended1st) {
                if (has2nd) {
                    riskColor = "#f59e0b";
                    riskBg = "rgba(245,158,11,0.06)";
                    riskBorder = "rgba(245,158,11,0.2)";
                    riskText = "中风险 (一供暂停-启用二供)";
                    riskDesc = "一供当前处于暂停供应状态，系统已自动联动二供作为主力支撑。";
                } else {
                    riskColor = "#b91c1c";
                    riskBg = "rgba(185,28,28,0.08)";
                    riskBorder = "rgba(185,28,28,0.3)";
                    riskText = "极高风险 (主供暂停且无备用通道) 🚨";
                    riskDesc = "第一供应商已暂停供应，且没有活跃的二供，随时面临断货！";
                }
            } else if (!has2nd) {
                if (backupActive.length > 0) {
                    riskColor = "#f59e0b";
                    riskBg = "rgba(245,158,11,0.06)";
                    riskBorder = "rgba(245,158,11,0.2)";
                    riskText = "中风险 (单一源-有备选通道)";
                    riskDesc = "仅有单一第一供应商，但已引入候补备供通道。建议尽快承认二供。";
                } else {
                    riskColor = "#ef4444";
                    riskBg = "rgba(239,68,68,0.06)";
                    riskBorder = "rgba(239,68,68,0.2)";
                    riskText = "高风险 (单一供应商) ⚠️";
                    riskDesc = "当前物料仅有唯一的独家一供，一旦发生突发停工将面临断货危机。";
                }
            }
        }
        
        const card = document.createElement("div");
        card.className = "glass-panel";
        card.style.cssText = `border:1px solid ${riskBorder}; background:${riskBg}; padding:16px; border-radius:8px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;`;
        
        let supListHtml = sups.map(s => {
            let statusIcon = s.status === '活跃' ? '🟢' : (s.status === '暂停' ? '⏸️' : '❌');
            let tierColor = s.supplier_tier === '一供' ? 'var(--color-primary)' : (s.supplier_tier === '二供' ? '#10b981' : '#8b5cf6');
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; padding:4px 0; border-bottom:1px dashed rgba(255,255,255,0.03);">
                    <span style="font-weight:600;">${statusIcon} ${s.supplier_name}</span>
                    <span style="font-size:0.7rem; color:${tierColor}; font-weight:bold; border:1px solid ${tierColor}30; padding:1px 4px; border-radius:3px; background:${tierColor}10;">${s.supplier_tier}</span>
                </div>
            `;
        }).join('') || `<div style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">暂未绑定任何供应商</div>`;
        
        card.innerHTML = `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <h4 style="font-size:0.9rem; font-weight:700; color:var(--text-main);">${m.mat_name}</h4>
                        <span style="font-family:monospace; font-size:0.75rem; color:var(--text-muted);">${m.mat_code}</span>
                    </div>
                    <span style="font-size:0.7rem; font-weight:bold; color:${riskColor}; border:1px solid ${riskColor}50; padding:2px 6px; border-radius:4px; background:${riskColor}10;">
                        ${riskText}
                    </span>
                </div>
                
                <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:12px; line-height:1.4;">${riskDesc}</p>
                
                <div style="background:rgba(0,0,0,0.15); border-radius:6px; padding:10px;">
                    <div style="font-size:0.7rem; font-weight:bold; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">已注册通道列表</div>
                    ${supListHtml}
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end;">
                <button class="btn-xs btn-outline" onclick="openMqcSupplierModal('${m.mat_code}')" style="font-size:0.7rem;">
                    <i data-lucide="edit-2" style="width:11px; height:11px;"></i> 管理供应商渠道
                </button>
            </div>
        `;
        board.appendChild(card);
    });

    lucide.createIcons({
        attrs: { "stroke-width": 2 },
        nameAttr: "data-lucide",
        node: board
    });
};

// 打开物料承认申请编辑弹窗
window.openMqcMaterialModal = function(id) {
    // 权限校验
    if (state.currentUserRole !== '管理员' && state.currentUserRole !== '产品经理' && state.currentUserRole !== '品质工程师' && state.currentUserRole !== '研发工程师') {
        showToast("仅管理员、产品经理、研发和品质工程师有权维护物料承认记录", "warning");
        return;
    }
    
    // 初始化下拉框选项（绑定 PLM 全局用户列表）
    populateUserSelect('mqc-mat-apply-by', '');
    populateUserSelect('mqc-mat-conclusion-by', '');
    
    // 重置所有输入框边框高亮
    ['mqc-mat-code', 'mqc-mat-name', 'mqc-mat-apply-by'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
    });

    if (id === null) {
        document.getElementById("mqc-material-modal-title").innerText = "新增物料承认记录";
        document.getElementById("mqc-mat-id").value = "";
        document.getElementById("mqc-mat-code").value = "";
        document.getElementById("mqc-mat-code").disabled = false;
        document.getElementById("mqc-mat-name").value = "";
        document.getElementById("mqc-mat-spec").value = "";
        document.getElementById("mqc-mat-category").value = "铜球";
        document.getElementById("mqc-mat-apply-date").value = new Date().toISOString().split('T')[0];
        document.getElementById("mqc-mat-apply-by").value = state.currentUserId || "";
        document.getElementById("mqc-mat-status").value = "需求提出";
        document.getElementById("mqc-mat-test-start").value = "";
        document.getElementById("mqc-mat-test-end").value = "";
        document.getElementById("mqc-mat-conclusion").value = "";
        document.getElementById("mqc-mat-conclusion-by").value = "";
        document.getElementById("mqc-mat-conclusion-date").value = "";
        document.getElementById("mqc-mat-test-result").value = "";
        document.getElementById("mqc-mat-remark").value = "";
        
        // 新增时无法管理供应商，必须先保存物料
        document.getElementById("mqc-mat-add-supplier-btn").style.display = "none";
        
        openModal("modal-mqc-material");
    } else {
        const m = state.mqcMaterials.find(x => x.id === id);
        if (!m) return;
        
        document.getElementById("mqc-material-modal-title").innerText = "编辑物料承认记录";
        document.getElementById("mqc-mat-id").value = m.id;
        document.getElementById("mqc-mat-code").value = m.mat_code || "";
        document.getElementById("mqc-mat-code").disabled = true; // 编码不可修改
        document.getElementById("mqc-mat-name").value = m.mat_name || "";
        document.getElementById("mqc-mat-spec").value = m.mat_spec || "";
        document.getElementById("mqc-mat-category").value = m.mat_category || "铜球";
        document.getElementById("mqc-mat-apply-date").value = m.apply_date || "";
        document.getElementById("mqc-mat-apply-by").value = m.apply_by || "";
        document.getElementById("mqc-mat-status").value = m.status || "需求提出";
        document.getElementById("mqc-mat-test-start").value = m.test_start || "";
        document.getElementById("mqc-mat-test-end").value = m.test_end || "";
        document.getElementById("mqc-mat-conclusion").value = m.conclusion || "";
        document.getElementById("mqc-mat-conclusion-by").value = m.conclusion_by || "";
        document.getElementById("mqc-mat-conclusion-date").value = m.conclusion_date || "";
        document.getElementById("mqc-mat-test-result").value = m.test_result || "";
        document.getElementById("mqc-mat-remark").value = m.remark || "";
        
        // 编辑时可以配置供应商
        document.getElementById("mqc-mat-add-supplier-btn").style.display = "inline-flex";
        document.getElementById("mqc-mat-add-supplier-btn").onclick = () => {
            closeModal("modal-mqc-material");
            openMqcSupplierModal(m.mat_code);
        };
        
        openModal("modal-mqc-material");
    }
};

// 保存物料承认记录
window.saveMqcMaterial = function() {
    const id = document.getElementById("mqc-mat-id").value;
    const mat_code = document.getElementById("mqc-mat-code").value.trim();
    const mat_name = document.getElementById("mqc-mat-name").value.trim();
    const apply_by = document.getElementById("mqc-mat-apply-by").value;
    
    // 校验必填项
    let hasErr = false;
    if (!mat_code) { document.getElementById("mqc-mat-code").style.borderColor = "#ef4444"; hasErr = true; }
    if (!mat_name) { document.getElementById("mqc-mat-name").style.borderColor = "#ef4444"; hasErr = true; }
    if (!apply_by) { document.getElementById("mqc-mat-apply-by").style.borderColor = "#ef4444"; hasErr = true; }
    
    if (hasErr) {
        showToast("请填写必填项（高亮红框部分）", "error");
        return;
    }
    
    // 校验编码是否冲突（仅新增时）
    if (!id) {
        const exist = state.mqcMaterials.some(m => m.mat_code === mat_code);
        if (exist) {
            showToast("此物料编码已存在，请重新输入或直接编辑已有台账", "error");
            document.getElementById("mqc-mat-code").style.borderColor = "#ef4444";
            return;
        }
    }
    
    const bodyData = {
        id: id ? parseInt(id) : null,
        mat_code: mat_code,
        mat_name: mat_name,
        mat_spec: document.getElementById("mqc-mat-spec").value.trim(),
        mat_category: document.getElementById("mqc-mat-category").value,
        apply_date: document.getElementById("mqc-mat-apply-date").value,
        apply_by: apply_by,
        status: document.getElementById("mqc-mat-status").value,
        test_start: document.getElementById("mqc-mat-test-start").value,
        test_end: document.getElementById("mqc-mat-test-end").value,
        conclusion: document.getElementById("mqc-mat-conclusion").value,
        conclusion_by: document.getElementById("mqc-mat-conclusion-by").value,
        conclusion_date: document.getElementById("mqc-mat-conclusion-date").value,
        test_result: document.getElementById("mqc-mat-test-result").value.trim(),
        remark: document.getElementById("mqc-mat-remark").value.trim()
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
            showToast("物料承认记录保存成功！", "success");
            closeModal("modal-mqc-material");
            fetchMqcData();
        }
    })
    .catch(err => {
        console.error("保存物料承认记录失败:", err);
        showToast("保存物料承认记录失败", "error");
    });
};

// 删除物料承认记录
window.deleteMqcMaterial = function(id) {
    if (state.currentUserRole !== '管理员' && state.currentUserRole !== '产品经理') {
        showToast("仅管理员或产品经理有权删除物料承认记录", "warning");
        return;
    }
    
    if (!confirm("确定要删除该物料承认台账吗？该物料关联的所有供应商信息也将一并删除，且不可恢复！")) {
        return;
    }
    
    fetch("/api/mqc/materials/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id })
    })
    .then(r => r.json())
    .then(res => {
        if (res.error) {
            showToast(res.error, "error");
        } else {
            showToast("物料及关联供应商渠道已成功删除！", "success");
            fetchMqcData();
        }
    })
    .catch(err => {
        console.error("删除物料承认记录失败:", err);
        showToast("删除物料承认记录失败", "error");
    });
};

// 打开供应商渠道维护弹窗
window.openMqcSupplierModal = function(matCode) {
    if (state.currentUserRole !== '管理员' && state.currentUserRole !== '产品经理' && state.currentUserRole !== '品质工程师' && state.currentUserRole !== '研发工程师') {
        showToast("仅管理员、产品经理、研发和品质工程师有权维护供应商信息", "warning");
        return;
    }
    
    const mat = state.mqcMaterials.find(m => m.mat_code === matCode);
    if (!mat) return;
    
    document.getElementById("mqc-supplier-mat-label").innerText = `${mat.mat_name} (${mat.mat_code})`;
    document.getElementById("mqc-sup-mat-code").value = matCode;
    
    resetMqcSupForm();
    renderMqcSupplierList(matCode);
    openModal("modal-mqc-supplier");
};

// 重置供应商填写表单
window.resetMqcSupForm = function() {
    document.getElementById("mqc-sup-id").value = "";
    document.getElementById("mqc-sup-name").value = "";
    document.getElementById("mqc-sup-name").style.borderColor = "";
    document.getElementById("mqc-sup-tier").value = "一供";
    document.getElementById("mqc-sup-contact").value = "";
    document.getElementById("mqc-sup-phone").value = "";
    document.getElementById("mqc-sup-risk").value = "中";
    document.getElementById("mqc-sup-status").value = "活跃";
    document.getElementById("mqc-sup-approved-date").value = new Date().toISOString().split('T')[0];
    document.getElementById("mqc-sup-risk-note").value = "";
};

// 渲染特定物料的所有供应商
function renderMqcSupplierList(matCode) {
    const listDiv = document.getElementById("mqc-supplier-list");
    if (!listDiv) return;
    
    const sups = state.mqcSuppliers.filter(s => s.mat_code === matCode);
    
    if (sups.length === 0) {
        listDiv.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.75rem; padding:15px; border:1px dashed var(--border-color); border-radius:6px;">暂未注册任何一供/二供供应商，存在极大单一源断货风险！</div>`;
        return;
    }
    
    listDiv.innerHTML = "";
    sups.forEach(s => {
        let statusBadge = s.status === '活跃' ? '<span class="badge badge-green">活跃</span>' : (s.status === '暂停' ? '<span class="badge badge-warning">暂停</span>' : '<span class="badge badge-danger">淘汰</span>');
        let tierColor = s.supplier_tier === '一供' ? 'var(--color-primary)' : (s.supplier_tier === '二供' ? '#10b981' : '#8b5cf6');
        let riskColor = s.risk_level === '低' ? '#10b981' : (s.risk_level === '中' ? '#f59e0b' : '#ef4444');
        
        const row = document.createElement("div");
        row.style.cssText = "background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:6px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;";
        row.innerHTML = `
            <div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="font-size:0.85rem; color:var(--text-main);">${s.supplier_name}</strong>
                    <span style="font-size:0.65rem; color:${tierColor}; font-weight:bold; border:1px solid ${tierColor}30; padding:1px 4px; border-radius:3px; background:${tierColor}10;">${s.supplier_tier}</span>
                    ${statusBadge}
                    <span style="font-size:0.7rem; color:${riskColor};">⚠️ ${s.risk_level}风险</span>
                </div>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:4px;">
                    联系方式: ${s.contact || '无'} (${s.phone || '无'}) &nbsp;|&nbsp; 批准日期: ${s.approved_date || '-'}
                </div>
                ${s.risk_note ? `<div style="font-size:0.68rem; color:#f59e0b; margin-top:2px;">风险备注: ${s.risk_note}</div>` : ''}
            </div>
            <div style="display:flex; gap:6px;">
                <button class="btn-xs btn-outline" onclick="loadMqcSupplierToForm(${s.id})">编辑</button>
                <button class="btn-xs btn-danger" onclick="deleteMqcSupplier(${s.id})">删除</button>
            </div>
        `;
        listDiv.appendChild(row);
    });
}

// 加载单个供应商信息到表单进行编辑
window.loadMqcSupplierToForm = function(id) {
    const s = state.mqcSuppliers.find(x => x.id === id);
    if (!s) return;
    
    document.getElementById("mqc-sup-id").value = s.id;
    document.getElementById("mqc-sup-name").value = s.supplier_name || "";
    document.getElementById("mqc-sup-tier").value = s.supplier_tier || "一供";
    document.getElementById("mqc-sup-contact").value = s.contact || "";
    document.getElementById("mqc-sup-phone").value = s.phone || "";
    document.getElementById("mqc-sup-risk").value = s.risk_level || "中";
    document.getElementById("mqc-sup-status").value = s.status || "活跃";
    document.getElementById("mqc-sup-approved-date").value = s.approved_date || "";
    document.getElementById("mqc-sup-risk-note").value = s.risk_note || "";
};

// 保存供应商
window.saveMqcSupplier = function() {
    const id = document.getElementById("mqc-sup-id").value;
    const mat_code = document.getElementById("mqc-sup-mat-code").value;
    const name = document.getElementById("mqc-sup-name").value.trim();
    
    if (!name) {
        document.getElementById("mqc-sup-name").style.borderColor = "#ef4444";
        showToast("请输入供应商名称！", "error");
        return;
    }
    
    const bodyData = {
        id: id ? parseInt(id) : null,
        mat_code: mat_code,
        supplier_name: name,
        supplier_tier: document.getElementById("mqc-sup-tier").value,
        contact: document.getElementById("mqc-sup-contact").value.trim(),
        phone: document.getElementById("mqc-sup-phone").value.trim(),
        risk_level: document.getElementById("mqc-sup-risk").value,
        risk_note: document.getElementById("mqc-sup-risk-note").value.trim(),
        approved_date: document.getElementById("mqc-sup-approved-date").value,
        status: document.getElementById("mqc-sup-status").value
    };
    
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
