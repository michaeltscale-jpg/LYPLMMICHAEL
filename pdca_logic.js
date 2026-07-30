// ======================== PDCA 质量持续改善控制中心 ========================

// 核心状态缓存
if (typeof state === 'undefined') window.state = {};
state.pdcaList = [];
state.pdcaActiveTab = 'kanban'; // 'kanban' | 'archived' | 'risk'

// P1~P4 4 大阶段管道解耦结构 (比照 EMS G1~G6 看板)
const PDCA_PIPELINE_STAGES = [
    { key: "Plan", num: "P1", title: "Plan 计划定案", role: "研发/质量部门", color: "#2563eb" },
    { key: "Do", num: "P2", title: "Do 措施执行", role: "制造/工程部门", color: "#d97706" },
    { key: "Check", num: "P3", title: "Check 效果验证", role: "品质检测中心", color: "#7c3aed" },
    { key: "Act", num: "P4", title: "Act 固化闭环", role: "标准化归档组", color: "#059669" }
];

// 离线/双击本地 index.html 时的默认演示数据
const fallbackPdcaList = [
    { id: 1, code: "PDCA-202607-001", title: "DBJ-CU-035 极薄铜箔中试卷边剥离强度波动超差 (Cpk < 1.25)", product_category: "PTS2 AI 铜箔", thickness: 12, initiator: "张工", factor_5m1e: "料", severity: "重大", stage: "Do", status: "进行中", owner: "张小贤", target_date: "2026-08-05", created_at: "2026-07-20" },
    { id: 2, code: "PDCA-202607-002", title: "生箔工段 3# 阴极辊表面晶核微瑕疵归因与消除", product_category: "HIS 载体铜箔", thickness: 2, initiator: "李品质", factor_5m1e: "机", severity: "一般", stage: "Closed", status: "已闭环", owner: "赵设备", target_date: "2026-07-15", created_at: "2026-07-21" },
    { id: 3, code: "PDCA-202607-003", title: "二供活性硫整形剂批次杂质超标防错管控", product_category: "PTS2 AI 铜箔", thickness: 12, initiator: "陈品质", factor_5m1e: "料", severity: "重大", stage: "Plan", status: "进行中", owner: "张小贤", target_date: "2026-08-10", created_at: "2026-07-25" },
    { id: 4, code: "PDCA-202607-004", title: "3μm 超薄铜箔剥离强度测试波动分析改善", product_category: "PTS2 AI 铜箔", thickness: 3, initiator: "王工程", factor_5m1e: "法", severity: "一般", stage: "Check", status: "进行中", owner: "李建国", target_date: "2026-07-28", created_at: "2026-07-22" }
];

// 切换 PDCA 主页签视角 ('kanban' | 'archived' | 'risk')
window.switchPdcaTab = function(tab) {
    state.pdcaActiveTab = tab;

    const btnKanban = document.getElementById("pdca-tab-btn-kanban");
    const btnArchived = document.getElementById("pdca-tab-btn-archived");
    const btnRisk = document.getElementById("pdca-tab-btn-risk");

    const panelKanban = document.getElementById("pdca-panel-kanban");
    const panelArchived = document.getElementById("pdca-panel-archived");
    const panelRisk = document.getElementById("pdca-panel-risk");

    [btnKanban, btnArchived, btnRisk].forEach(btn => {
        if (btn) {
            btn.style.borderBottom = "2px solid transparent";
            btn.style.color = "var(--text-secondary)";
            btn.classList.remove("active");
        }
    });

    [panelKanban, panelArchived, panelRisk].forEach(panel => {
        if (panel) panel.style.display = "none";
    });

    if (tab === 'kanban') {
        if (btnKanban) {
            btnKanban.style.borderBottom = "2px solid var(--color-primary)";
            btnKanban.style.color = "var(--color-primary)";
            btnKanban.classList.add("active");
        }
        if (panelKanban) panelKanban.style.display = "block";
    } else if (tab === 'archived') {
        if (btnArchived) {
            btnArchived.style.borderBottom = "2px solid var(--color-primary)";
            btnArchived.style.color = "var(--color-primary)";
            btnArchived.classList.add("active");
        }
        if (panelArchived) panelArchived.style.display = "block";
    } else if (tab === 'risk') {
        if (btnRisk) {
            btnRisk.style.borderBottom = "2px solid var(--color-primary)";
            btnRisk.style.color = "var(--color-primary)";
            btnRisk.classList.add("active");
        }
        if (panelRisk) panelRisk.style.display = "block";
    }

    renderPdcaAll();
};

// 拉取后端 PDCA 数据
window.fetchPdcaData = function() {
    const url = "/api/pdca/list";
    if (window.location.protocol === 'file:') {
        state.pdcaList = fallbackPdcaList;
        renderPdcaAll();
        return;
    }

    fetch(url)
        .then(res => res.json())
        .then(list => {
            state.pdcaList = (Array.isArray(list) && list.length > 0) ? list : fallbackPdcaList;
            renderPdcaAll();
        })
        .catch(err => {
            console.warn("使用离线默认 PDCA 数据:", err);
            state.pdcaList = fallbackPdcaList;
            renderPdcaAll();
        });
};

// 全量渲染 3 大页签视图
window.renderPdcaAll = function() {
    renderPdcaPipelineKanban();
    renderPdcaArchivedTable();
    renderPdcaRiskView();
};

// 5M1E 分类标签切换处理
window.setPdcaFactorFilter = function(factor) {
    state.pdcaFactorFilter = factor;

    document.querySelectorAll(".pdca-factor-btn").forEach(btn => {
        const f = btn.getAttribute("data-factor");
        if (f === factor) {
            btn.classList.add("active");
            btn.style.background = "var(--color-primary)";
            btn.style.color = "#ffffff";
            btn.style.borderColor = "var(--color-primary)";
        } else {
            btn.classList.remove("active");
            const factorStyles = {
                '': { bg: 'var(--bg-input)', color: 'var(--text-primary)', border: 'var(--border-color)' },
                '人': { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
                '机': { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
                '料': { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
                '法': { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' },
                '环': { bg: '#fae8ff', color: '#86198f', border: '#f5d0fe' }
            };
            const s = factorStyles[f] || factorStyles[''];
            btn.style.background = s.bg;
            btn.style.color = s.color;
            btn.style.borderColor = s.border;
        }
    });

    renderPdcaAll();
};

// 1. 渲染 P1-P4 质量改善 4 大阶段管道看板 (比照 EMS 附图1)
window.renderPdcaPipelineKanban = function() {
    const gridEl = document.getElementById("pdca-pipeline-kanban-grid");
    if (!gridEl) return;

    const factorVal = state.pdcaFactorFilter || "";
    const productVal = document.getElementById("pdca-product-filter")?.value || "";
    const searchKey = (document.getElementById("pdca-keyword-search")?.value || "").trim().toLowerCase();

    // 过滤进行中的改善单
    let filteredList = (state.pdcaList || []).filter(item => {
        if (factorVal && item.factor_5m1e !== factorVal) return false;
        if (productVal && !(item.product_category || "").includes(productVal)) return false;
        if (searchKey) {
            const matchTitle = (item.title || "").toLowerCase().includes(searchKey);
            const matchCode = (item.code || "").toLowerCase().includes(searchKey);
            const matchProblem = (item.problem_desc || "").toLowerCase().includes(searchKey);
            const matchImprove = (item.improve_plan || "").toLowerCase().includes(searchKey);
            const matchOwner = (item.owner || "").toLowerCase().includes(searchKey);
            if (!matchTitle && !matchCode && !matchProblem && !matchImprove && !matchOwner) return false;
        }
        return true;
    });

    const factorBadgeStyles = {
        '人': 'background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;',
        '机': 'background: #fef3c7; color: #92400e; border: 1px solid #fcd34d;',
        '料': 'background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7;',
        '法': 'background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd;',
        '环': 'background: #fae8ff; color: #86198f; border: 1px solid #f5d0fe;'
    };

    let html = '';

    PDCA_PIPELINE_STAGES.forEach(st => {
        // 属于该阶段的改善单 (且未闭环)
        const stageItems = filteredList.filter(item => {
            if (item.status === '已闭环' || item.stage === 'Closed') return false;
            return item.stage === st.key;
        });

        let cardsHtml = '';
        if (stageItems.length === 0) {
            cardsHtml = `
                <div style="border:2px dashed var(--border-color); border-radius:10px; padding:36px 12px; text-align:center; color:var(--text-muted); font-size:0.8rem; background:rgba(248,250,252,0.5);">
                    暂无推进中改善单
                </div>
            `;
        } else {
            stageItems.forEach(item => {
                const factorStyle = factorBadgeStyles[item.factor_5m1e] || factorBadgeStyles['法'];
                const prodText = item.product_category ? `${item.product_category} (${item.thickness || '通用'}μm)` : (item.thickness ? `通用规格 (${item.thickness}μm)` : '通用规格');
                const isOverdue = item.target_date && item.target_date < new Date().toISOString().split('T')[0];

                cardsHtml += `
                    <div class="glass-panel" style="padding:10px 12px; margin-bottom:10px; border:1px solid var(--border-color); border-radius:8px; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,0.03); cursor:pointer; transition:all 0.15s ease;" onclick="openPdcaEditModal(${item.id})" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 1px 4px rgba(0,0,0,0.03)';">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <span style="font-family:monospace; font-weight:800; font-size:0.78rem; color:var(--color-primary);">${item.code}</span>
                            <span style="padding:1px 6px; border-radius:8px; font-size:0.68rem; font-weight:800; ${factorStyle}">${item.factor_5m1e}</span>
                        </div>
                        <h4 style="margin:0 0 5px 0; font-size:0.82rem; font-weight:800; color:var(--text-primary); line-height:1.35; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;" title="${(item.title||'').replace(/"/g, '&quot;')}">${item.title}</h4>
                        <div style="font-size:0.72rem; color:var(--text-secondary); margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:65%;">📦 ${prodText}</span>
                            <span style="font-weight:600; color:var(--text-muted); font-size:0.7rem; white-space:nowrap;">${item.owner || '-'}</span>
                        </div>
                        <div style="font-size:0.7rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
                            <span>目标完成:</span>
                            <span style="font-weight:800; color:${isOverdue ? '#ef4444' : 'var(--text-primary)'};">${item.target_date || '-'}</span>
                        </div>
                    </div>
                `;
            });
        }

        html += `
            <div class="pdca-pipeline-column" style="background:rgba(248,250,252,0.6); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid ${st.color}; padding-bottom:8px; margin-bottom:6px;">
                    <div>
                        <span style="font-weight:800; font-size:0.95rem; color:${st.color};">${st.num}. ${st.title}</span>
                    </div>
                    <span class="badge" style="background:rgba(37,99,235,0.1); color:${st.color}; font-weight:800; font-size:0.8rem; padding:2px 8px;">${stageItems.length}</span>
                </div>
                <div style="font-size:0.72rem; color:var(--text-secondary); margin-bottom:12px; font-weight:500;">${st.role}</div>
                ${cardsHtml}
            </div>
        `;
    });

    gridEl.innerHTML = html;
    if (window.lucide) lucide.createIcons();
};

// 2. 渲染归档改善台账 (Sub-Tab 2)
window.renderPdcaArchivedTable = function() {
    const tbody = document.getElementById("pdca-archived-table-body");
    if (!tbody) return;

    const factorVal = state.pdcaFactorFilter || "";
    const productVal = document.getElementById("pdca-product-filter")?.value || "";
    const searchKey = (document.getElementById("pdca-keyword-search")?.value || "").trim().toLowerCase();

    let list = (state.pdcaList || []).filter(item => {
        if (factorVal && item.factor_5m1e !== factorVal) return false;
        if (productVal && !(item.product_category || "").includes(productVal)) return false;
        if (searchKey) {
            const matchTitle = (item.title || "").toLowerCase().includes(searchKey);
            const matchCode = (item.code || "").toLowerCase().includes(searchKey);
            const matchProblem = (item.problem_desc || "").toLowerCase().includes(searchKey);
            const matchImprove = (item.improve_plan || "").toLowerCase().includes(searchKey);
            const matchOwner = (item.owner || "").toLowerCase().includes(searchKey);
            if (!matchTitle && !matchCode && !matchProblem && !matchImprove && !matchOwner) return false;
        }
        return true;
    });

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted);">暂无匹配的 PDCA 归档改善记录</td></tr>`;
        return;
    }

    const factorBadgeStyles = {
        '人': 'background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;',
        '机': 'background: #fef3c7; color: #92400e; border: 1px solid #fcd34d;',
        '料': 'background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7;',
        '法': 'background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd;',
        '环': 'background: #fae8ff; color: #86198f; border: 1px solid #f5d0fe;'
    };

    let html = '';
    list.forEach(row => {
        const factorStyle = factorBadgeStyles[row.factor_5m1e] || factorBadgeStyles['法'];
        let statusBadge = '<span style="color:#eab308;font-weight:700;">● 进行中</span>';
        if (row.status === '已闭环' || row.stage === 'Closed') {
            statusBadge = '<span style="color:#10b981;font-weight:700;">✓ 已闭环</span>';
        }

        const prodText = row.product_category ? `${row.product_category} ${row.thickness ? row.thickness + 'μm' : ''}` : (row.thickness ? row.thickness + 'μm' : '通用规格');

        html += `
            <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:10px 8px;font-family:monospace;font-weight:700;color:var(--color-primary);font-size:0.78rem;white-space:nowrap;">${row.code}</td>
                <td style="padding:10px 8px;font-weight:700;font-size:0.82rem;max-width:220px;word-break:break-word;line-height:1.4;">${row.title}</td>
                <td style="padding:10px 8px;font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;">${prodText}</td>
                <td style="padding:10px 8px;text-align:center;white-space:nowrap;">
                    <span style="padding:3px 12px;border-radius:10px;font-size:0.78rem;font-weight:800;white-space:nowrap;display:inline-block;${factorStyle}">${row.factor_5m1e}</span>
                </td>
                <td style="padding:10px 8px;text-align:center;white-space:nowrap;font-size:0.78rem;font-weight:700;color:var(--color-primary);">${row.stage}</td>
                <td style="padding:10px 8px;text-align:center;font-size:0.76rem;white-space:nowrap;">${statusBadge}</td>
                <td style="padding:10px 8px;font-size:0.78rem;font-weight:600;white-space:nowrap;">${row.owner || '-'}</td>
                <td style="padding:10px 8px;font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">${row.target_date || '-'}</td>
                <td style="padding:10px 8px;text-align:center;white-space:nowrap;">
                    <div style="display:flex;gap:6px;justify-content:center;">
                        <button class="btn-secondary" onclick="openPdcaEditModal(${row.id})" style="padding:3px 8px;font-size:0.72rem;">编辑</button>
                        <button class="btn-secondary" onclick="exportPdca8DReport(${row.id})" style="padding:3px 8px;font-size:0.72rem;color:#2563eb;">导出8D</button>
                        <button class="btn-secondary" onclick="deletePdcaRecord(${row.id})" style="padding:3px 8px;font-size:0.72rem;color:var(--color-danger);">删除</button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    if (window.lucide) lucide.createIcons();
};

// 3. 渲染改善延误与风险提示 (Sub-Tab 3)
window.renderPdcaRiskView = function() {
    const delayContainer = document.getElementById("pdca-risk-delay-list");
    const factorContainer = document.getElementById("pdca-risk-5m-stats");
    if (!delayContainer || !factorContainer) return;

    const list = state.pdcaList || [];
    const todayStr = new Date().toISOString().split('T')[0];

    // 过滤延误项目
    const delayedItems = list.filter(item => {
        return (item.status !== '已闭环' && item.stage !== 'Closed') && item.target_date && item.target_date < todayStr;
    });

    if (delayedItems.length === 0) {
        delayContainer.innerHTML = `<div style="padding:20px; text-align:center; color:#059669; font-weight:700; background:#d1fae5; border-radius:8px;">✓ 暂无超期延误的 PDCA 改善项目，所有改善单均按期推进中！</div>`;
    } else {
        let delayHtml = '';
        delayedItems.forEach(item => {
            const start = new Date(item.target_date);
            const today = new Date(todayStr);
            const diffDays = Math.ceil((today - start) / (1000 * 60 * 60 * 24));

            delayHtml += `
                <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                            <span style="font-family:monospace; font-weight:800; color:#dc2626; font-size:0.82rem;">${item.code}</span>
                            <span class="badge badge-danger">已超期 ${diffDays} 天</span>
                            <span style="font-size:0.75rem; color:var(--text-secondary);">当前阶段: ${item.stage}</span>
                        </div>
                        <div style="font-size:0.85rem; font-weight:800; color:#991b1b; margin-bottom:4px;">${item.title}</div>
                        <div style="font-size:0.75rem; color:#b91c1c;">责任人: <strong>${item.owner || '-'}</strong> | 目标要求完成日: ${item.target_date}</div>
                    </div>
                    <button class="btn-primary" style="font-size:0.75rem; padding:6px 12px; background:#dc2626; border:none; font-weight:700; border-radius:6px; cursor:pointer;" onclick="triggerDqeApproval('pdca', { id: ${item.id}, target_name: '${(item.title||'').replace(/'/g, "\\'")} (${item.code})', stage_flow: '${item.stage} ➔ 催办进入下一阶段' })">
                        🛡️ 催办核准
                    </button>
                </div>
            `;
        });
        delayContainer.innerHTML = delayHtml;
    }

    // 5M1E 归因分布统计
    const factorCounts = { '人': 0, '机': 0, '料': 0, '法': 0, '环': 0 };
    list.forEach(item => {
        if (factorCounts[item.factor_5m1e] !== undefined) {
            factorCounts[item.factor_5m1e]++;
        }
    });

    const total = list.length || 1;
    const factorLabels = {
        '人': '人 (Man) — 操作/培训未达标',
        '机': '机 (Machine) — 设备/磨损与保养偏差',
        '料': '料 (Material) — 原辅料杂质/主材波动',
        '法': '法 (Method) — 工艺参数/SOP复核偏差',
        '环': '环 (Env) — 温湿度/洁净度环境波动'
    };

    let statsHtml = '';
    Object.entries(factorCounts).forEach(([k, count]) => {
        const percent = Math.round((count / total) * 100);
        statsHtml += `
            <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:0.78rem; font-weight:700; color:var(--text-primary); margin-bottom:4px;">
                    <span>${factorLabels[k]}</span>
                    <span>${count} 件 (${percent}%)</span>
                </div>
                <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                    <div style="width:${percent}%; height:100%; background:linear-gradient(90deg, #3b82f6, #1d4ed8); border-radius:4px;"></div>
                </div>
            </div>
        `;
    });

    factorContainer.innerHTML = statsHtml;
    if (window.lucide) lucide.createIcons();
};
