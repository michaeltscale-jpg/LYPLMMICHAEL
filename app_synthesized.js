// Application state
let state = {
    products: [],
    activeProductId: null,
    activeProduct: null,
    ecns: [],
    dingtalkLogs: [],
    activeTab: 'dashboard-panel',
    activePlmSubTab: 'npi', // 'npi', 'tds', 'bom', 'routing'
    selectedBomVersion: null, // 当前查看的BOM版本
    selectedTdsVersion: null, // 当前查看的TDS版本
    currentUserRole: 'Process Engineer', // 默认登录身份：工艺工程师 (李工)
    charts: {}

window.openTestReportDetail = function(batchNo) {
    const product = state.activeProduct;
    if (!product) return;

    const rec = (product.test_records || []).find(r => r.batch_no === batchNo);
    if (!rec) {
        showToast("未找到该批次质检记录数据", "error");
        return;
    }

    document.getElementById("coa-product-name").innerText = product.name;
    document.getElementById("coa-product-code").innerText = product.code;
    document.getElementById("coa-batch-no").innerText = rec.batch_no;
    document.getElementById("coa-product-category").innerText = product.category;
    document.getElementById("coa-tester").innerText = rec.tester;
    document.getElementById("coa-test-time").innerText = formatDate(rec.created_at);

    const coaTbody = document.getElementById("coa-table-body");
    coaTbody.innerHTML = "";

    const items = [
        { name: "标称厚度 / 实测厚度 (Thickness)", spec: `${product.spec_thickness} ± 0.5 μm`, actual: `${rec.actual_thickness} μm`, ok: Math.abs(rec.actual_thickness - product.spec_thickness) <= 0.5 },
        { name: "毛面粗糙度 Rz (Roughness Rz-M)", spec: `≤ ${product.target_roughness} μm`, actual: `${rec.roughness_rz_m} μm`, ok: rec.roughness_rz_m <= product.target_roughness },
        { name: "光面粗糙度 Rz (Roughness Rz-S)", spec: `≤ 2.50 μm (行业推荐值)`, actual: `${rec.roughness_rz_s} μm`, ok: rec.roughness_rz_s <= 2.5 },
        { name: "层间剥离强度 (Peel Strength)", spec: `≥ ${product.target_peel} N/mm`, actual: `${rec.peel_strength} N/mm`, ok: rec.peel_strength >= product.target_peel },
        { name: "高频介质损耗 (10GHz Df)", spec: `≤ ${product.target_df}`, actual: rec.df_10ghz.toFixed(4), ok: rec.df_10ghz <= product.target_df },
        { name: "铜箔抗拉强度 (Tensile Strength)", spec: `≥ ${product.target_tensile} MPa`, actual: `${rec.tensile_strength} MPa`, ok: rec.tensile_strength >= product.target_tensile },
        { name: "铜箔常温延伸率 (Elongation)", spec: `≥ ${product.target_elongation} %`, actual: `${rec.elongation} %`, ok: rec.elongation >= product.target_elongation }
    ];

    items.forEach(it => {
        const tr = document.createElement("tr");
        const statusIcon = it.ok 
            ? `<span style="color:var(--color-success); font-weight:bold; display:flex; align-items:center; gap:3px;"><i data-lucide="check-circle" style="width:12px; height:12px;"></i>符合</span>`
            : `<span style="color:#ef4444; font-weight:bold; display:flex; align-items:center; gap:3px;"><i data-lucide="x-circle" style="width:12px; height:12px;"></i>不符合</span>`;

        tr.innerHTML = `
            <td style="font-weight:500;">${it.name}</td>
            <td style="text-align:center; color:var(--text-secondary);">${it.spec}</td>
            <td style="text-align:center; font-weight:600; color:${it.ok ? 'var(--text-primary)' : '#ef4444'}">${it.actual}</td>
            <td style="text-align:center;">${statusIcon}</td>
        `;
        coaTbody.appendChild(tr);
    });

    const conclusionEl = document.getElementById("coa-final-conclusion");
    if (rec.test_result === "合格") {
        conclusionEl.innerHTML = `
            <span style="color:var(--color-success); font-weight:bold; font-size:0.95rem; display:flex; align-items:center; gap:4px;">
                <i data-lucide="check" style="width:16px; height:16px;"></i> 检验合格 (PASS)
            </span>
            <p style="color:var(--text-secondary); margin-top:4px; font-size:0.75rem; margin-bottom:0;">该批次产品物理性能及高频介导损耗指标（10GHz Df）均完全符合其 TDS 技术规格书要求，准予出厂放行并导入下一步量产工序。</p>
        `;
    } else {
        conclusionEl.innerHTML = `
            <span style="color:#ef4444; font-weight:bold; font-size:0.95rem; display:flex; align-items:center; gap:4px;">
                <i data-lucide="alert-triangle" style="width:16px; height:16px;"></i> 检验不合格 (REJECTED)
            </span>
            <p style="color:#ef4444; margin-top:4px; font-size:0.75rem; margin-bottom:0;">原因定位：${rec.remarks || '部分指标未达TDS限值'}。本批次判定为不合格品，已锁定开发状态并提交品质工程部处理。</p>
        `;
    }

    openModal("modal-test-report-detail");
    if (window.lucide) {
        lucide.createIcons();
    }
};

window.printCoaReport = function() {
    const printContent = document.getElementById("coa-print-area").innerHTML;
    
    const win = window.open("", "_blank");
    win.document.write(`
        <html>
        <head>
            <title>GHZ_PLM_CoA_${Date.now()}</title>
            <style>
                body {
                    font-family: 'Helvetica Neue', Arial, sans-serif;
                    color: #1e293b;
                    background: #fff;
                    padding: 40px;
                }
                .badge {
                    display: inline-block;
                    padding: 2px 8px;
                    font-size: 11px;
                    font-weight: bold;
                    border-radius: 4px;
                    background: #f1f5f9;
                    color: #475569;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                    margin-bottom: 25px;
                }
                th, td {
                    border: 1px solid #cbd5e1;
                    padding: 10px 12px;
                    text-align: left;
                    font-size: 12px;
                }
                th {
                    background: #f8fafc;
                    font-weight: bold;
                }
                @media print {
                    body { padding: 0; }
                    button { display: none; }
                }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <div style="border: 2px solid #0f172a; padding: 25px; border-radius: 8px; position:relative;">
                ${printContent}
            </div>
        </body>
        </html>
    `);
    win.document.close();
}; // Chart.js
};

// 本地状态保存
function saveStateToLocalStorage() {
    try {
        const savedData = {
            activeTab: state.activeTab,
            activeProductId: state.activeProductId,
            activePlmSubTab: state.activePlmSubTab,
            currentUsername: state.currentUsername,
            currentUserRole: state.currentUserRole,
            currentUserDisplayName: state.currentUserDisplayName,
            categoryFilter: document.getElementById("sidebar-category-filter")?.value || ""
        };
        localStorage.setItem("ghz_plm_state", JSON.stringify(savedData));
    } catch (e) {
        console.error("保存本地状态失败", e);
    }
}

// 本地状态加载
function loadStateFromLocalStorage() {
    try {
        const saved = localStorage.getItem("ghz_plm_state");
        if (saved) {
            const savedState = JSON.parse(saved);
            if (savedState.activeTab) state.activeTab = savedState.activeTab;
            if (savedState.activeProductId) state.activeProductId = savedState.activeProductId;
            if (savedState.activePlmSubTab) state.activePlmSubTab = savedState.activePlmSubTab;
            if (savedState.currentUsername) state.currentUsername = savedState.currentUsername;
            if (savedState.currentUserRole) state.currentUserRole = savedState.currentUserRole;
            if (savedState.currentUserDisplayName) state.currentUserDisplayName = savedState.currentUserDisplayName;
            if (savedState.categoryFilter !== undefined) {
                state.categoryFilter = savedState.categoryFilter;
            }
        }
    } catch (e) {
        console.error("加载本地状态失败", e);
    }
}

// 本地状态保存
function saveStateToLocalStorage() {
    try {
        const savedData = {
            activeTab: state.activeTab,
            activeProductId: state.activeProductId,
            activePlmSubTab: state.activePlmSubTab,
            currentUsername: state.currentUsername,
            currentUserRole: state.currentUserRole,
            currentUserDisplayName: state.currentUserDisplayName,
            categoryFilter: document.getElementById("sidebar-category-filter")?.value || ""
        };
        localStorage.setItem("ghz_plm_state", JSON.stringify(savedData));
    } catch (e) {
        console.error("保存本地状态失败", e);
    }
}

// 本地状态加载
function loadStateFromLocalStorage() {
    try {
        const saved = localStorage.getItem("ghz_plm_state");
        if (saved) {
            const savedState = JSON.parse(saved);
            if (savedState.activeTab) state.activeTab = savedState.activeTab;
            if (savedState.activeProductId) state.activeProductId = savedState.activeProductId;
            if (savedState.activePlmSubTab) state.activePlmSubTab = savedState.activePlmSubTab;
            if (savedState.currentUsername) state.currentUsername = savedState.currentUsername;
            if (savedState.currentUserRole) state.currentUserRole = savedState.currentUserRole;
            if (savedState.currentUserDisplayName) state.currentUserDisplayName = savedState.currentUserDisplayName;
            if (savedState.categoryFilter !== undefined) {
                state.categoryFilter = savedState.categoryFilter;
            }
        }
    } catch (e) {
        console.error("加载本地状态失败", e);
    }
}

// 前端鉴权核心辅助函数
window.checkPermission = function(allowedRoles, actionName) {
    const role = state.currentUserRole || 'Viewer';
    if (role === 'Admin') return true; // 超级管理员免检
    if (allowedRoles.includes(role)) return true;

    const roleNames = {
        'Admin': '超级管理员',
        'Product Manager': '产品经理',
        'Process Engineer': '工艺工程师',
        'Quality Engineer': '质量工程师',
        'Viewer': '只读访客'
    };
    const curName = roleNames[role] || role;
    showToast(`【权限不足】当前身份【${curName}】无权进行「${actionName}」操作，请在页眉切换登录身份。`, "error");
    return false;
};

// 角色身份切换事件
window.onUserRoleChange = function(selectEl) {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    if (!selectedOption) return;
    
    state.currentUsername = selectEl.value;
    state.currentUserRole = selectedOption.getAttribute('data-role');
    state.currentUserDisplayName = selectedOption.getAttribute('data-display-name');
    
    showToast(`登录身份已成功切换为：${selectedOption.text}`, "success");
    saveStateToLocalStorage();
    saveStateToLocalStorage();
    
    // 根据当前所处 Tab 面板立即重刷局部渲染以更新操作按钮及表格的可用状态
    if (state.activeTab === 'plm-panel' && state.activeProductId) {
        loadProductDetails(state.activeProductId);
    } else if (state.activeTab === 'users-panel') {
        fetchUsersListAndRender();
    } else if (state.activeTab === 'ecn-panel') {
        fetchEcns();
    }
};

// 全局拦截并自动注入用户身份及角色请求头
const originalFetch = window.fetch;
window.fetch = function(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    if (state.currentUserRole) {
        options.headers['X-User-Role'] = state.currentUserRole;
    }
    if (state.currentUserDisplayName) {
        options.headers['X-User-Name'] = encodeURIComponent(state.currentUserDisplayName);
    }
    if (state.currentUsername) {
        options.headers['X-User-Username'] = state.currentUsername;
    }
    return originalFetch(url, options);
};

// 预定义各工段参数名称和单位，用于偏差对比和弹窗渲染
const STAGE_FIELDS = {
    "溅镀工段": [
        { key: "Cu_conc", name: "铜离子浓度", unit: "g/L", threshold: 2.0 },
        { key: "H2SO4_conc", name: "硫酸浓度", unit: "g/L", threshold: 5.0 },
        { key: "temp", name: "电解液温度", unit: "℃", threshold: 3.0 },
        { key: "flow_rate", name: "循环流速", unit: "m³/h", threshold: 20.0 },
        { key: "Cl_conc", name: "氯离子含量", unit: "ppm", threshold: 3.0 }
    ],
    "溅镀工段": [
        { key: "vacuum", name: "极限真空度", unit: "Pa", threshold: 0.0001 },
        { key: "work_pressure", name: "工作气压", unit: "Pa", threshold: 0.05 },
        { key: "power", name: "溅射总功率", unit: "kW", threshold: 1.0 },
        { key: "voltage", name: "靶工作电压", unit: "V", threshold: 10.0 },
        { key: "current", name: "靶工作电流", unit: "A", threshold: 0.5 },
        { key: "ar_flow", name: "高纯Ar流量", unit: "sccm", threshold: 5.0 },
        { key: "temp", name: "基板加热温度", unit: "℃", threshold: 5.0 },
        { key: "speed", name: "运行线速度", unit: "m/min", threshold: 0.5 },
        { key: "thickness", name: "打底层厚度", unit: "nm", threshold: 2.0 },
        { key: "uniformity", name: "膜厚均匀性极差", unit: "%", threshold: 1.0 },
        { key: "target_life", name: "靶材累积消耗", unit: "kWh", threshold: 50.0 }
    ],
    "电镀工段": [
        { key: "voltage", name: "电解电压", unit: "V", threshold: 0.2 },
        { key: "current_density", name: "电流密度", unit: "A/dm²", threshold: 2.0 },
        { key: "drum_speed", name: "阴极辊转速", unit: "m/min", threshold: 0.3 }
    ],
    "表面处理工段": [
        { key: "line_speed", name: "处理线速度", unit: "m/min", threshold: 1.0 },
        { key: "treat_current", name: "粗化电流", unit: "A", threshold: 100.0 },
        { key: "silane_conc", name: "硅烷偶联剂浓度", unit: "%", threshold: 0.1 },
        { key: "dry_temp", name: "红外烘干温度", unit: "℃", threshold: 5.0 },
        { key: "passivation_ph", name: "防氧化钝化液pH", unit: "", threshold: 0.5 }
    ],
    "分切工段": [
        { key: "tension", name: "收卷张力", unit: "N", threshold: 20.0 },
        { key: "slit_speed", name: "分切线速", unit: "m/min", threshold: 10.0 },
        { key: "aoi_defects", name: "AOI缺陷数", unit: "个/卷", threshold: 1 }
    ]
};

const CATEGORY_THICKNESS = {
    "PTS2 AI 铜箔": [12, 18, 35],
    "HIS 载体铜箔": [3, 2, 1.5],
    "背板双晶铜箔": [9, 12, 18]
};

function getStagesForProduct(category) {
    if (category === "HIS 载体铜箔") {
        return ["立项", "溅镀工段", "电镀工段", "表面处理工段", "分切工段", "测试验证", "量产送样"];
    } else {
        return ["立项", "溅镀工段", "电镀工段", "表面处理工段", "分切工段", "测试验证", "量产送样"];
    }
}

function getStatusActiveIndex(status, category) {
    const stages = getStagesForProduct(category);
    if (status === "立项中") return 0;
    if (status === "钉钉立项审批中") return 0;
    if (status === "溶铜造液中") return stages.indexOf("溅镀工段");
    if (status === "溅镀开发中") return stages.indexOf("溅镀工段");
    if (status === "生箔电镀中") return stages.indexOf("电镀工段");
    if (status === "表面处理中") return stages.indexOf("表面处理工段");
    if (status === "分切包装中") return stages.indexOf("分切工段");
    if (status === "测试验证中") return stages.indexOf("测试验证");
    if (status === "量产中") return stages.indexOf("量产送样");
    return 0;
}

// App Initialization
document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    
    // 1. 加载本地状态
    loadStateFromLocalStorage();
    
    // 2. 初始化监听器
    initEventListeners();
    
    // 3. 拉取用户角色并还原
    fetchUsers().then(() => {
        const categoryFilter = state.categoryFilter || "";
        const filterEl = document.getElementById("sidebar-category-filter");
        if (filterEl) {
            filterEl.value = categoryFilter;
        }

        // 先拉取侧边栏产品
        let url = "/api/products";
        if (categoryFilter) {
            url += `?category=${encodeURIComponent(categoryFilter)}`;
        }
        return fetch(url);
    }).then(res => res.json()).then(products => {
        state.products = products;
        renderSidebarProducts();

        // 4. 拉取驾驶舱仪表盘
        fetchDashboardData();

        // 还原主 Tab 及产品详情
        switchTab(state.activeTab);
        if (state.activeProductId) {
            loadProductDetails(state.activeProductId);
        }

        fetchDingTalkSettings();
        setInterval(fetchDingTalkApprovals, 5000);
    }).catch(e => {
        console.error("Initialization failed:", e);
    });
});

// Event Listeners Binding
function initEventListeners() {
    // Navigation routing
    document.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", () => {
            const target = item.getAttribute("data-target");
            switchTab(target);
        });
    });

    document.getElementById("sidebar-category-filter").addEventListener("change", (e) => {
        state.categoryFilter = e.target.value;
        saveStateToLocalStorage();
        fetchProducts(e.target.value);
    });

    document.getElementById("dms-category-filter").addEventListener("change", (e) => {
        renderDmsPanel();
    });

    document.getElementById("btn-new-project").addEventListener("click", () => {
        if (checkPermission(["Admin", "Product Manager"], "新品开发立项")) {
            openProjectModal();
        }
    });

    document.getElementById("proj-category").addEventListener("change", (e) => {
        updateThicknessOptions(e.target.value);
        autoDeriveProjectNameAndCode();
    });

    document.getElementById("proj-thickness").addEventListener("change", () => {
        autoDeriveProjectNameAndCode();
    });

    document.getElementById("proj-surface-treatment").addEventListener("change", () => {
        autoDeriveProjectNameAndCode();
    });

    document.getElementById("btn-submit-project").addEventListener("click", () => {
        if (checkPermission(["Admin", "Product Manager"], "提交新品立项")) {
            submitNewProject();
        }
    });
    document.getElementById("dingtalk-config-form").addEventListener("submit", (e) => {
        e.preventDefault();
        if (checkPermission(["Admin"], "保存钉钉协同配置")) {
            saveDingTalkSettings(e);
        }
    });
    document.getElementById("btn-submit-process-log").addEventListener("click", () => {
        if (checkPermission(["Admin", "Process Engineer", "Quality Engineer"], "录入工艺开发参数")) {
            submitProcessLog();
        }
    });
    document.getElementById("btn-submit-test-record").addEventListener("click", () => {
        if (checkPermission(["Admin", "Process Engineer", "Quality Engineer"], "录入质量检验指标")) {
            submitTestRecord();
        }
    });
    document.getElementById("btn-submit-tds").addEventListener("click", () => {
        if (checkPermission(["Admin", "Process Engineer", "Quality Engineer"], "更新Gate 1进度计划")) {
            saveTdsSpecs();
        }
    });
    document.getElementById("btn-npi-save-bom").addEventListener("click", () => {
        if (checkPermission(["Admin", "Process Engineer"], "在线保存NPI配方")) {
            submitNpiSaveBom();
        }
    });
    document.getElementById("btn-edit-bom-sub").addEventListener("click", () => {
        if (checkPermission(["Admin", "Process Engineer"], "升级配方版本")) {
            openBomDesignerNew();
        }
    });
    document.getElementById("btn-submit-bom-design-new").addEventListener("click", () => {
        if (checkPermission(["Admin", "Process Engineer"], "保存并提交新配方")) {
            submitNewBomDesign();
        }
    });
    document.getElementById("btn-design-routing").addEventListener("click", () => {
        if (checkPermission(["Admin", "Process Engineer"], "在线设计工艺路线")) {
            openRoutingDesigner();
        }
    });
    document.getElementById("btn-submit-routing-design").addEventListener("click", () => {
        if (checkPermission(["Admin", "Process Engineer"], "保存并提交工艺路线")) {
            submitNewRoutingDesign();
        }
    });

    document.getElementById("btn-create-ecn").addEventListener("click", () => {
        if (checkPermission(["Admin", "Process Engineer"], "创建工程设变(ECN)")) {
            openEcnModal();
        }
    });
    document.getElementById("btn-submit-ecn").addEventListener("click", () => {
        if (checkPermission(["Admin", "Process Engineer"], "提交工程设变单")) {
            submitNewEcn();
        }
    });

    document.getElementById("btn-sync-ding").addEventListener("click", () => {
        if (checkPermission(["Admin", "Product Manager", "Process Engineer", "Quality Engineer"], "同步数据状态")) {
            showToast("同步中...", "info");
            fetchDashboardData();
            fetchDingTalkApprovals();
            if (state.activeProductId) {
                loadProductDetails(state.activeProductId);
            }
        }
    });

    bindRiskOptions("risk-peel-group");
    bindRiskOptions("risk-df-group");
}

function bindRiskOptions(groupId) {
    const group = document.getElementById(groupId);
    group.querySelectorAll(".risk-option").forEach(opt => {
        opt.addEventListener("click", () => {
            group.querySelectorAll(".risk-option").forEach(o => o.classList.remove("selected"));
            opt.classList.add("selected");
        });
    });
}

// Router Switch Tab
function switchTab(tabId) {
    document.querySelectorAll(".menu-item").forEach(item => {
        item.classList.remove("active");
        if (item.getAttribute("data-target") === tabId) {
            item.classList.add("active");
        }
    });

    document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.classList.remove("active");
    });
    document.getElementById(tabId).classList.add("active");
    
    state.activeTab = tabId;
    saveStateToLocalStorage();
    saveStateToLocalStorage();
    
    const headerTitleMap = {
        'dashboard-panel': '研发驾驶舱 (高频铜箔生命周期总览)',
        'plm-panel': '产品开发管控控制台 (PLM)',
        'dms-panel': '研发文档管理中心 (DMS)',
        'ecn-panel': '工程变更管控中心 (ECN)',
        'dingtalk-panel': '钉钉协同配置与回调调试中心',
        'users-panel': '用户与系统角色权限控制台'
    };
    document.getElementById("header-panel-title").innerText = headerTitleMap[tabId] || 'PLM平台';

    if (tabId === 'plm-panel' && state.activeProductId) {
        loadProductDetails(state.activeProductId);
    } else if (tabId === 'dashboard-panel') {
        fetchDashboardData();
    } else if (tabId === 'dms-panel') {
        renderDmsPanel();
    } else if (tabId === 'ecn-panel') {
        fetchEcns();
    } else if (tabId === 'dingtalk-panel') {
        fetchDingTalkApprovals();
    } else if (tabId === 'users-panel') {
        fetchUsersListAndRender();
    }
}

// PLM sub Tab switch
window.switchPlmSubTab = function(subTabId) {
    document.querySelectorAll(".sub-tabs-nav button").forEach(btn => {
        btn.classList.remove("active");
    });
    document.getElementById(`tab-btn-${subTabId}`).classList.add("active");

    document.querySelectorAll(".plm-subpanel").forEach(panel => {
        panel.style.display = "none";
    });
    document.getElementById(`plm-subpanel-${subTabId}`).style.display = "flex";

    state.activePlmSubTab = subTabId;
    state.selectedBomVersion = null; // 切换Tab重置BOM版本查看
    saveStateToLocalStorage();
    saveStateToLocalStorage();

    if (state.activeProduct) {
        if (subTabId === 'npi') renderNpiSubpanel();
        else if (subTabId === 'tds') renderTdsSubpanel();
        else if (subTabId === 'bom') renderBomSubpanel();
        else if (subTabId === 'routing') renderRoutingSubpanel();
    }
};

window.switchToDmsDocument = function(productId, docFileName) {
    switchTab('dms-panel');
    fetch(`/api/products/${productId}`)
        .then(res => res.json())
        .then(product => {
            state.activeProduct = product;
            state.activeProductId = productId;
            saveStateToLocalStorage();
            if (typeof renderDmsPanel === "function") {
                renderDmsPanel();
            }
            setTimeout(() => {
                if (typeof previewDmsTemplate === "function") {
                    previewDmsTemplate(docFileName);
                }
            }, 150);
        });
};

// ======================== 管控模块零：NPI 新品导入全流程联动渲染 ========================
function renderNpiSubpanel() {
    const product = state.activeProduct;
    const workflow = product.npi_workflow;
    if (!workflow) return;

    const titleEl = document.getElementById("npi-panel-title");
    if (titleEl) {
        titleEl.innerText = `${product.name} (${product.code})`;
    }

    const metaEl = document.getElementById("npi-panel-meta");
    if (metaEl) {
        metaEl.innerHTML = `产品分类: <span class="badge badge-purple" style="font-size:0.7rem; padding:2px 6px;">${product.category}</span> | 创建人: <strong>${product.creator}</strong> | 创建时间: <strong>${formatDate(product.created_at)}</strong>`;
    }

    // 1. 渲染顶部 5 大门禁里程碑 (Milestones Row)
    const milestonesRow = document.getElementById("npi-milestones-row");
    milestonesRow.innerHTML = "";

    const gates = [
        { key: "gate1", num: "G1", label: "立项与目标" },
        { key: "gate2", num: "G2", label: "配方定型（EVT）" },
        { key: "gate3", num: "G3", label: "工艺与中试（DVT）" },
        { key: "gate4", num: "G4", label: "生产验证（PVT）" },
        { key: "gate5", num: "G5", label: "PPAP 与量产（MP）" }
    ];

    gates.forEach(g => {
        const gateData = workflow[g.key];
        const stepDiv = document.createElement("div");
        stepDiv.className = `npi-milestone-step ${gateData.status.toLowerCase()}`;
        
        let statusIcon = g.num;
        if (gateData.status === "COMPLETED") {
            statusIcon = `<i data-lucide="check" style="width: 14px; height: 14px;"></i>`;
        } else if (gateData.status === "FAILED") {
            statusIcon = `<i data-lucide="x" style="width: 14px; height: 14px;"></i>`;
        }

        stepDiv.innerHTML = `
            <div class="npi-milestone-node">${statusIcon}</div>
            <div class="npi-milestone-label">${g.label}</div>
        `;
        milestonesRow.appendChild(stepDiv);
    });

    // 2. 渲染 5 大 Gate 卡片详细内容与联动 (Gates Cards Grid)
    const container = document.getElementById("npi-gates-container");
    container.innerHTML = "";

    gates.forEach((g, index) => {
        const gateData = workflow[g.key];
        const card = document.createElement("div");
        card.className = `npi-gate-card ${gateData.status.toLowerCase()}`;

        // 门禁状态徽章
        let statusBadge = "";
        if (gateData.status === "COMPLETED") statusBadge = `<span class="badge badge-green">已通过</span>`;
        else if (gateData.status === "RUNNING") statusBadge = `<span class="badge badge-blue">进行中</span>`;
        else if (gateData.status === "APPROVING") statusBadge = `<span class="badge badge-warning">钉钉审批中</span>`;
        else if (gateData.status === "FAILED") statusBadge = `<span class="badge badge-danger">不合格</span>`;
        else statusBadge = `<span class="badge badge-gray">未开启</span>`;

        // 统一渲染项目排期与负责人参数展示
        const bodyHtml = `
            <div class="npi-gate-data-box" style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
                <div class="npi-gate-data-item" style="display: flex; justify-content: space-between; font-size: 0.75rem; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 4px;">
                    <span class="npi-gate-data-label" style="color: var(--text-secondary);">开始日期</span>
                    <span class="npi-gate-data-value" style="font-weight: 500; color: var(--text-primary);">${gateData.data.start_date || "-"}</span>
                </div>
                <div class="npi-gate-data-item" style="display: flex; justify-content: space-between; font-size: 0.75rem; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 4px;">
                    <span class="npi-gate-data-label" style="color: var(--text-secondary);">计划完成</span>
                    <span class="npi-gate-data-value" style="font-weight: 500; color: var(--text-primary);">${gateData.data.plan_end_date || "-"}</span>
                </div>
                <div class="npi-gate-data-item" style="display: flex; justify-content: space-between; font-size: 0.75rem; padding-bottom: 2px;">
                    <span class="npi-gate-data-label" style="color: var(--text-secondary);">负责人</span>
                    <span class="npi-gate-data-value" style="color: var(--color-primary); font-weight: 600;">${gateData.data.owner || "-"}</span>
                </div>
            </div>
        `;

        // 专项业务关联操作功能
        let upperActionHtml = "";
        if (g.key === "gate1") {
            upperActionHtml = `<button class="btn-secondary" style="font-size:0.72rem; padding:4px 6px; width:100%; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="openG1DocsModal()"><i data-lucide="file-text" style="width:11px; height:11px;"></i> 查看/编辑立项文件</button>`;
        } else if (g.key === "gate2") {
            upperActionHtml = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; width: 100%;">
                    <button class="btn-secondary" style="font-size: 0.68rem; padding: 4px; display: flex; align-items: center; justify-content: center; gap: 3px;" onclick="switchPlmSubTab('bom')"><i data-lucide="layers" style="width: 11px; height: 11px;"></i> 配方 BOM</button>
                    <button class="btn-primary" style="font-size: 0.68rem; padding: 4px; display: flex; align-items: center; justify-content: center; gap: 3px;" onclick="openEcnModalWithProduct(${product.id})"><i data-lucide="git-pull-request" style="width: 11px; height: 11px;"></i> 申请设变</button>
                </div>
            `;
        } else if (g.key === "gate3") {
            upperActionHtml = `<button class="btn-secondary" style="font-size:0.72rem; padding:4px 6px; width:100%; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="switchPlmSubTab('routing')"><i data-lucide="eye" style="width:11px; height:11px;"></i> 查看工艺中试</button>`;
        } else if (g.key === "gate4") {
            upperActionHtml = `<button class="btn-secondary" style="font-size:0.72rem; padding:4px 6px; width:100%; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="openQualityTestModal()"><i data-lucide="beaker" style="width:11px; height:11px;"></i> 录入品质数据</button>`;
        } else if (g.key === "gate5") {
            upperActionHtml = `<button class="btn-secondary" style="font-size:0.72rem; padding:4px 6px; width:100%; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="submitImportProduction(${product.id})"><i data-lucide="rocket" style="width:11px; height:11px;"></i> 申请导入量产</button>`;
        }

        // 渲染阶段最下沿的“评审标签”按钮
        let reviewTagHtml = "";
        const gateStatus = (gateData && gateData.status) ? gateData.status.toUpperCase() : "LOCKED";

        if (gateStatus === "COMPLETED" || gateStatus === "已完成") {
            reviewTagHtml = `<button class="btn-xs" style="font-size:0.75rem; padding:6px 8px; width:100%; background:#d1fae5; color:#065f46; border:1px solid #a7f3d0; font-weight:700; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="event.stopPropagation(); triggerDqeApproval('npi', { id: ${product.id}, spec_thickness: ${product.spec_thickness}, stage_key: '${g.key}', target_name: '${(product.code || '新品').replace(/'/g, "\\'")} (${product.spec_thickness}μm)', stage_flow: '${g.num} ${g.label}' })">
                <i data-lucide="check-circle" style="width:13px; height:13px; color:#059669;"></i> ✓ ${g.num} 评审通过
            </button>`;
        } else if (gateStatus === "RUNNING" || gateStatus === "APPROVING" || gateStatus === "进行中") {
            reviewTagHtml = `<button class="btn-primary" style="font-size:0.75rem; padding:6px 8px; width:100%; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#ffffff; border:none; font-weight:700; border-radius:6px; cursor:pointer; box-shadow:0 2px 6px rgba(16,185,129,0.25); display:flex; align-items:center; justify-content:center; gap:4px;" onclick="event.stopPropagation(); triggerDqeApproval('npi', { id: ${product.id}, spec_thickness: ${product.spec_thickness}, stage_key: '${g.key}', target_name: '${(product.code || '新品').replace(/'/g, "\\'")} (${product.spec_thickness}μm)', stage_flow: '${g.num} ${g.label} ➔ 进入下一阶段' })">
                <i data-lucide="shield-check" style="width:13px; height:13px;"></i> 🛡️ ${g.num} 阶段评审
            </button>`;
        } else {
            reviewTagHtml = `<button class="btn-secondary" disabled style="font-size:0.75rem; padding:6px 8px; width:100%; background:#f8fafc; color:#94a3b8; border:1px solid #e2e8f0; font-weight:600; border-radius:6px; cursor:not-allowed; display:flex; align-items:center; justify-content:center; gap:4px;">
                <i data-lucide="lock" style="width:12px; height:12px; color:#cbd5e1;"></i> 🔒 ${g.num} 待前置评审
            </button>`;
        }

        card.innerHTML = `
            <div class="npi-gate-card-header">
                <span class="npi-gate-index">${g.num}</span>
                ${statusBadge}
            </div>
            <div>
                <h4 class="npi-gate-title">${index + 1}. ${g.label}</h4>
                <div class="npi-gate-card-body">
                    ${bodyHtml}
                </div>
            </div>
            <div class="npi-gate-card-footer" style="display:flex; flex-direction:column; gap:6px;">
                ${upperActionHtml}
                ${reviewTagHtml}
        `;

        if (gateData.status !== "LOCKED") {
            card.addEventListener("click", (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                    return;
                }
                openNpiGateDetail(g.key);
            });
        }

        container.appendChild(card);
    });

    lucide.createIcons();
}

// 弹出对应 NPI 门禁阶段的详细控制与编辑模态对话框
window.openNpiGateDetail = function(gateKey) {
    const product = state.activeProduct;
    const workflow = product.npi_workflow;
    const gateData = workflow[gateKey];
    if (!gateData || gateData.status === "LOCKED") return;

    if (gateKey === "gate1") {
        document.getElementById("tds-roughness").value = product.target_roughness;
        document.getElementById("tds-peel").value = product.target_peel;
        document.getElementById("tds-df").value = product.target_df;
        document.getElementById("tds-tensile").value = product.target_tensile;
        document.getElementById("tds-elongation").value = product.target_elongation;

        const pPlan = product.npi_project_plan || {};
        const g1Plan = pPlan.gate1 || {};
        document.getElementById("tds-plan-start").value = g1Plan.start_date || "";
        document.getElementById("tds-plan-end").value = g1Plan.plan_end_date || "";
        document.getElementById("tds-plan-owner").value = g1Plan.owner || "";

        openModal("modal-tds-edit");
    } 
    
    else if (gateKey === "gate2") {
        openBomDesignerNew();
    } 
    
    else if (gateKey === "gate3") {
        const listDiv = document.getElementById("npi-routing-detail-list");
        listDiv.innerHTML = "";

        const stages = getStagesForProduct(product.category);
        const activeIndex = getStatusActiveIndex(product.status, product.category);
        const activeStageName = stages[activeIndex];

        product.routing.forEach((r, idx) => {
            const item = document.createElement("div");
            item.className = "npi-routing-detail-item";
            
            const isCurrentActive = r.stage_name === activeStageName;
            if (isCurrentActive) {
                item.classList.add("active");
            }

            const actualLogs = product.development_logs.filter(l => l.stage === r.stage_name);
            let devHtml = "";
            
            if (actualLogs.length > 0) {
                const latestLog = actualLogs[actualLogs.length - 1];
                for (const [key, val] of Object.entries(latestLog.parameters)) {
                    const field = STAGE_FIELDS[r.stage_name]?.find(f => f.key === key);
                    const stdVal = r.standard_params[key];
                    if (field && stdVal !== undefined) {
                        const dev = parseFloat((val - stdVal).toFixed(4));
                        const isOk = Math.abs(dev) <= field.threshold;
                        devHtml += `
                            <div style="display:flex; justify-content:space-between; margin-top:4px;">
                                <span>${field.name}: 实测 ${val} (标准 ${stdVal})</span>
                                <span class="deviation-badge ${isOk ? 'badge-green' : 'badge-danger'}">偏差: ${dev > 0 ? '+' : ''}${dev}</span>
                            </div>
                        `;
                    }
                }
            } else {
                devHtml = `<div style="color: var(--text-muted); font-style: italic;">该工段现场数据尚未录入</div>`;
            }

            let inputFormHtml = "";
            if (isCurrentActive) {
                inputFormHtml = `
                    <div style="margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 8px;">
                        <button class="btn-primary" style="font-size:0.75rem; padding: 4px 8px;" onclick="closeModal('modal-npi-routing-detail'); openProcessLogModal('${r.stage_name}');">
                            <i data-lucide="edit-3" style="width:12px; height:12px;"></i> 就地录入中试实际参数
                        </button>
                    </div>
                `;
            }

            item.innerHTML = `
                <div class="npi-routing-detail-item-header">
                    <span>工序 ${idx + 1}: ${r.stage_name}</span>
                    <span class="badge ${isCurrentActive ? 'badge-blue' : 'badge-gray'}">${isCurrentActive ? '进行中' : '已就绪'}</span>
                </div>
                <div class="npi-routing-detail-item-body">
                    <div style="margin-bottom: 6px; color: var(--text-secondary);">推荐机台: ${r.device_name} (${r.device_code})</div>
                    ${devHtml}
                    ${inputFormHtml}
                </div>
            `;
            listDiv.appendChild(item);
        });

        openModal("modal-npi-routing-detail");
        lucide.createIcons();
    } 
    
    else if (gateKey === "gate4") {
        const tbody = document.querySelector("#npi-quality-history-table tbody");
        tbody.innerHTML = "";

        if (product.test_records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">暂无检验批次记录</td></tr>`;
        } else {
            product.test_records.forEach(r => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="font-weight: 600;">${r.batch_no}</td>
                    <td>${r.roughness_rz_m} μm</td>
                    <td>${r.peel_strength} N/mm</td>
                    <td>${r.df_10ghz}</td>
                    <td>${r.elongation}%</td>
                    <td><span class="badge ${r.test_result === '合格' ? 'badge-green' : 'badge-danger'}">${r.test_result}</span></td>
                    <td>${r.tester}</td>
                `;
                tbody.appendChild(tr);
            });
        }
        openModal("modal-npi-quality-detail");
    } 
    
    else if (gateKey === "gate5") {
        const infoDiv = document.getElementById("npi-release-status-info");
        const submitBtn = document.getElementById("btn-npi-submit-release");

        if (gateData.status === "COMPLETED") {
            infoDiv.innerHTML = `
                <div style="text-align: center; color: var(--color-success); padding: 20px 0;">
                    <i data-lucide="check-circle" style="width: 48px; height: 48px; margin-bottom: 12px;"></i>
                    <h4>新品已成功导入量产并封档发布！</h4>
                    <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 8px;">
                        产品状态: 量产中 | 工艺规格已写入量产数据库。
                    </p>
                </div>
            `;
            submitBtn.style.display = "none";
        } else if (gateData.status === "RUNNING") {
            const qcBatch = product.test_records.find(t => t.test_result === '合格');
            infoDiv.innerHTML = `
                <p style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.6; margin-bottom: 16px;">
                    产品经过严格中试和物理化学高频检验，已满足全部 NPI 质量标准门禁要求。<br>
                    <strong>合格批次：</strong> ${qcBatch ? qcBatch.batch_no : '--'}<br>
                    <strong>实测损耗：</strong> ${qcBatch ? qcBatch.df_10ghz : '--'}<br>
                    点击下方按钮，新品将正式宣告开发结束，导入大规模量产交付阶段！
                </p>
            `;
            submitBtn.style.display = "block";
            submitBtn.onclick = () => {
                closeModal("modal-npi-release-detail");
                submitImportProduction(product.id);
            };
        } else {
            infoDiv.innerHTML = `
                <p style="color: var(--color-danger); text-align: center; padding: 20px 0;">
                    <i data-lucide="alert-triangle" style="width: 32px; height: 32px; margin-bottom: 8px;"></i><br>
                    当前新品品质检验尚未达标或工艺中试尚未结束，无法进行量产导入发布。
                </p>
            `;
            submitBtn.style.display = "none";
        }

        openModal("modal-npi-release-detail");
        lucide.createIcons();
    }
};

window.submitNpiSaveBom = function() {
    const product = state.activeProduct;
    if (!product) return;

    const payload = {
        copper_wire_ratio: document.getElementById("npi-bom-copper").value,
        sulfuric_acid_ratio: document.getElementById("npi-bom-sulfuric").value,
        additive_gel: document.getElementById("npi-bom-gel").value,
        additive_hec: document.getElementById("npi-bom-hec").value,
        additive_s: document.getElementById("npi-bom-s").value,
        silane_type: document.getElementById("npi-bom-silane-type").value,
        silane_conc: document.getElementById("npi-bom-silane-conc").value,
        updater: document.getElementById("npi-bom-updater").value
    };

    fetch(`/api/products/${product.id}/save_bom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, "success");
        closeModal("modal-npi-bom-detail");
        loadProductDetails(product.id);
    });
};

// 辅助方法：快捷跳转到工艺工段录入参数
window.jumpAndOpenRoutingLog = function() {
    switchPlmSubTab('routing');
    const stages = getStagesForProduct(state.activeProduct.category);
    const activeIndex = getStatusActiveIndex(state.activeProduct.status, state.activeProduct.category);
    const activeStageName = stages[activeIndex];
    if (activeStageName) {
        openProcessLogModal(activeStageName);
    }
};

// 辅助方法：快捷打开质量测试录入弹窗
window.openQualityTestModal = function() {
    document.getElementById("btn-add-test-record").click();
};

// 辅助方法：提交量产发布
window.submitImportProduction = function(id) {
    fetch(`/api/products/${id}/import_production`, { method: "POST" })
        .then(res => res.json())
        .then(data => {
            showToast(data.message, "success");
            loadProductDetails(id);
            fetchDashboardData();
        });
};

function fetchProducts(category = "") {
    let url = "/api/products";
    if (category) {
        url += `?category=${encodeURIComponent(category)}`;
    }
    fetch(url)
        .then(res => res.json())
        .then(products => {
            state.products = products;
            renderSidebarProducts();
        });
}

function updateThicknessOptions(category) {
    const select = document.getElementById("proj-thickness");
    select.innerHTML = "";
    const thicknesses = CATEGORY_THICKNESS[category] || [12];
    thicknesses.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.innerText = t + " μm";
        select.appendChild(opt);
    });

    const roughness = document.getElementById("proj-roughness");
    const df = document.getElementById("proj-df");
    const peel = document.getElementById("proj-peel");
    const tensile = document.getElementById("proj-tensile");
    const elongation = document.getElementById("proj-elongation");
    const nameInput = document.getElementById("proj-name");
    const codeInput = document.getElementById("proj-code");

    if (category === "PTS2 AI 铜箔") {
        roughness.value = "1.20";
        df.value = "0.0012";
        peel.value = "0.75";
        tensile.value = "310";
        elongation.value = "2.5";
    } else if (category === "HIS 载体铜箔") {
        roughness.value = "0.80";
        df.value = "0.0010";
        peel.value = "0.50";
        tensile.value = "290";
        elongation.value = "2.0";
    } else if (category === "背板双晶铜箔") {
        roughness.value = "1.50";
        df.value = "0.0015";
        peel.value = "0.85";
        tensile.value = "340";
        elongation.value = "3.2";
    }

    autoDeriveProjectNameAndCode();

    select.onchange = () => {
        autoDeriveProjectNameAndCode();
    };
}

// Fetch dashboard statistical data
function fetchDashboardData() {
    fetch("/api/products")
        .then(res => res.json())
        .then(products => {
            let developingCount = 0;
            let productionCount = 0;
            products.forEach(p => {
                if (p.status === "量产中") {
                    productionCount++;
                } else if (p.status !== "废弃") {
                    developingCount++;
                }
            });
            
            document.getElementById("metric-developing").innerText = developingCount;
            document.getElementById("metric-production").innerText = productionCount;

            // 防止类别过滤状态下，定时刷新全局产品而把侧边栏过滤冲掉
            const categoryFilter = document.getElementById("sidebar-category-filter")?.value || "";
            if (!categoryFilter) {
                state.products = products;
                renderSidebarProducts();
                if (!state.activeProductId && products.length > 0) {
                    state.activeProductId = products[0].id;
                }
            } else {
                if (!state.activeProductId && products.length > 0) {
                    const match = products.find(p => p.category === categoryFilter);
                    state.activeProductId = match ? match.id : products[0].id;
                }
            }

            if (state.activeTab === 'dashboard-panel') {
                renderDashboardCharts(products);
            }
        });

    fetch("/api/ecns")
        .then(res => res.json())
        .then(ecns => {
            state.ecns = ecns;
            let activeEcns = ecns.filter(e => e.status === "草稿" || e.status === "钉钉审批中").length;
            document.getElementById("metric-ecns").innerText = activeEcns;

            const tbody = document.querySelector("#dashboard-ecn-table tbody");
            tbody.innerHTML = "";
            ecns.slice(0, 5).forEach(e => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="font-weight: 600;">${e.ecn_no}</td>
                    <td>${e.product_code}</td>
                    <td><span class="badge badge-purple">${e.change_type}</span></td>
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.change_reason}</td>
                    <td><span class="badge ${getEcnStatusBadgeClass(e.status)}">${e.status}</span></td>
                    <td>${formatDate(e.created_at)}</td>
                `;
                tbody.appendChild(tr);
            });
        });

    document.getElementById("metric-passrate").innerText = "94.2%";
}

function getEcnStatusBadgeClass(status) {
    if (status === "草稿") return "badge-gray";
    if (status === "钉钉审批中") return "badge-warning";
    if (status === "已批准") return "badge-green";
    if (status === "已拒绝") return "badge-danger";
    return "badge-gray";
}

// Render left sidebar product list
// Render top product tabs bar (标签更换，所有模块内容跟着主产品联动)
function renderProductTabs() {
    const tabsWrap = document.getElementById("product-tabs-bar");
    if (!tabsWrap) return;
    tabsWrap.innerHTML = "";

    state.products.forEach(p => {
        const item = document.createElement("div");
        item.className = `prod-tab-item ${p.id === state.activeProductId ? 'active' : ''}`;
        
        let dotClass = "gray";
        if (p.status === "量产中") dotClass = "green";
        else if (p.status.includes("审批")) dotClass = "yellow";
        else if (["溶铜造液中", "溅镀开发中", "生箔电镀中", "表面处理中", "分切包装中", "测试验证中"].includes(p.status)) dotClass = "blue";

        item.innerHTML = `
            <span class="prod-tab-status-dot ${dotClass}"></span>
            <strong style="font-size:0.78rem;">${p.code}</strong>
            <span style="opacity:0.75; font-size:0.7rem; font-weight:normal;">(${p.name})</span>
        `;

        item.addEventListener("click", () => {
            state.activeProductId = p.id;
            saveStateToLocalStorage();
            
            renderProductTabs();
            loadProductDetails(p.id);
        });

        tabsWrap.appendChild(item);
    });
}

function renderSidebarProducts() {
    // 隐藏整个包装好的左下角原研发产品区块，释放侧边栏空间且绝不伤及其他菜单
    const quickPanel = document.getElementById("sidebar-products-quick-panel");
    if (quickPanel) {
        quickPanel.style.display = "none";
    }
    
    // 渲染顶部的产品页签栏
    renderProductTabs();
}

// Load detailed product data from API
function loadProductDetails(id) {
    fetch(`/api/products/${id}`)
        .then(res => res.json())
        .then(product => {
            state.activeProduct = product;
            state.activeProductId = id;
            saveStateToLocalStorage();
            state.activeProductId = id;
            saveStateToLocalStorage();
            
            const catEl = document.getElementById("plm-prod-category");
            if (catEl) catEl.innerText = product.category || "AI 极薄铜箔";
            const nameEl = document.getElementById("plm-prod-name");
            if (nameEl) nameEl.innerText = product.name || "PTS2 AI 铜箔";
            const modelEl = document.getElementById("plm-prod-model-code");
            if (modelEl) modelEl.innerText = `${product.code || 'PTS-AI'}-${product.spec_thickness || 12}μm`;
            const creatorEl = document.getElementById("plm-prod-creator");
            if (creatorEl) creatorEl.innerText = product.creator || "张研发";
            const timeEl = document.getElementById("plm-prod-time");
            if (timeEl) timeEl.innerText = formatDate(product.created_at);
            
            const specThick = document.getElementById("plm-spec-thickness");
            if (specThick) specThick.innerHTML = `${product.spec_thickness} <span>μm</span>`;
            const specRough = document.getElementById("plm-target-roughness");
            if (specRough) specRough.innerHTML = `${product.target_roughness} <span>μm</span>`;
            const specDf = document.getElementById("plm-target-df");
            if (specDf) specDf.innerText = product.target_df;
            const specPeel = document.getElementById("plm-target-peel");
            if (specPeel) specPeel.innerHTML = `${product.target_peel} <span>N/mm</span>`;

            renderProductActionButtons(product);
            renderLifecycleFlow(product);

            // 联动渲染子 Tab Panel
            switchPlmSubTab(state.activePlmSubTab);

            // 渲染NPI研发各阶段交付文件
            renderNpiDeliverables(product);

            document.querySelectorAll(".sidebar-prod-item").forEach(item => {
                item.classList.remove("active");
            });
            renderSidebarProducts();
        });
}

function renderProductActionButtons(product) {
    const actionArea = document.getElementById("plm-action-area");
    if (!actionArea) return;
    actionArea.innerHTML = "";

    if (product.status === "立项中") {
        const btn = document.createElement("button");
        btn.className = "btn-primary";
        btn.innerHTML = `<i data-lucide="send"></i> 发起钉钉立项审批`;
        btn.addEventListener("click", () => submitDingTalkApproval(product.id, "PRODUCT"));
        actionArea.appendChild(btn);
    } else if (product.status === "钉钉立项审批中") {
        actionArea.innerHTML = `<span class="badge badge-warning" style="padding: 6px 12px; font-size: 0.85rem;"><i data-lucide="clock" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i> 钉钉审批中...</span>`;
    } else if (product.status === "量产中") {
        actionArea.innerHTML = `<span class="badge badge-green" style="padding: 6px 12px; font-size: 0.85rem;"><i data-lucide="check-circle" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i> 已导入量产</span>`;
    } else {
        const btn = document.createElement("button");
        btn.className = "btn-secondary";
        btn.innerHTML = `<i data-lucide="git-pull-request"></i> 发起工艺 ECN 设变`;
        btn.addEventListener("click", () => openEcnModalWithProduct(product.id));
        actionArea.appendChild(btn);
    }
    lucide.createIcons();
}

// Render horizontal lifecycle state axis
function renderLifecycleFlow(product) {
    const flowWrap = document.getElementById("lifecycle-flow-steps");
    if (!flowWrap) return;
    flowWrap.innerHTML = "";

    const stages = getStagesForProduct(product.category);
    const activeIndex = getStatusActiveIndex(product.status, product.category);
    
    stages.forEach((stage, idx) => {
        const step = document.createElement("div");
        step.className = "flow-step";
        if (idx < activeIndex) {
            step.classList.add("completed");
        } else if (idx === activeIndex) {
            step.classList.add("active");
        }
        
        if (product.status === "钉钉立项审批中" && idx === 0) {
            step.className = "flow-step warning";
        }

        step.innerHTML = `
            <div class="step-node">${idx + 1}</div>
            <div class="step-label">${stage}</div>
        `;

        flowWrap.appendChild(step);
    });
}

// ======================== 管控模块一：产品主数据 TDS 渲染 ========================
function renderTdsSubpanel() {
    const product = state.activeProduct;
    const activeVersionBadge = document.getElementById("tds-active-version-badge");
    const tbody = document.querySelector("#tds-spec-table tbody");
    const timelineEl = document.getElementById("tds-version-timeline");

    if (!tbody || !timelineEl) return;

    tbody.innerHTML = "";
    timelineEl.innerHTML = "";

    // 1. 判定要显示的 TDS 版本
    let displayTds = null;
    if (state.selectedTdsVersion) {
        displayTds = (product.tds_list || []).find(t => t.tds_version === state.selectedTdsVersion);
    } else {
        displayTds = product.tds; // 默认活动版本
    }

    if (!displayTds && product.tds_list && product.tds_list.length > 0) {
        displayTds = product.tds_list[0];
    }

    if (!displayTds) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">暂无 TDS 数据，点击上方「新增检验项」开始创建。</td></tr>`;
        return;
    }

    const isActiveTds = displayTds.status === '活动';
    activeVersionBadge.innerText = `TDS 版本: ${displayTds.tds_version} (${displayTds.status})`;
    activeVersionBadge.className = `badge ${isActiveTds ? 'badge-green' : 'badge-gray'}`;

    // 同步控制编辑与新增按钮的可见性
    const addRowBtn = document.getElementById("btn-tds-add-row");
    const publishBtn = document.getElementById("btn-tds-publish");
    if (addRowBtn) addRowBtn.style.display = isActiveTds ? 'flex' : 'none';
    if (publishBtn) publishBtn.style.display = isActiveTds ? 'flex' : 'none';

    // 2. 渲染检验项表格
    const items = displayTds.tds_items || [];
    items.forEach((item, idx) => {
        const tr = document.createElement("tr");

        const editBtn = isActiveTds
            ? `<button class="btn-secondary" style="padding:2px 8px; font-size:0.72rem;" onclick="openTdsRowEditModal(${idx})">
                    <i data-lucide="edit-3" style="width:11px; height:11px;"></i> 编辑
               </button>
               <button class="btn-secondary" style="padding:2px 6px; font-size:0.72rem; color:var(--color-danger);" onclick="deleteTdsRow(${idx})">
                    <i data-lucide="trash-2" style="width:11px; height:11px;"></i>
               </button>`
            : `<span style="color:var(--text-muted); font-size:0.72rem;">只读</span>`;

        let itemNo = item.item_no !== undefined ? item.item_no : (idx + 1);
        let nameHtml = `<div><strong>${item.name_zh || ''}</strong></div>`;
        if (item.name_en) {
            nameHtml += `<div style="font-size:0.72rem; color:var(--text-muted);">${item.name_en}</div>`;
        }
        if (item.group) {
            nameHtml = `<span class="badge badge-purple" style="margin-right:6px; font-size:0.65rem; padding:1px 4px; vertical-align:middle;">${item.group}</span>` + nameHtml;
        }

        tr.innerHTML = `
            <td style="text-align: center; color: var(--text-secondary); font-weight: 500;">${itemNo}</td>
            <td>${nameHtml}</td>
            <td style="text-align: center;">${item.unit || '-'}</td>
            <td style="font-weight: 600; color: var(--color-primary);">${item.spec || ''}</td>
            <td style="font-size:0.75rem; color: var(--text-secondary);">${item.test_standard || ''}</td>
            <td style="text-align:right; white-space:nowrap;">${editBtn}</td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();

    // 3. 渲染右侧 TDS 版本历史轴
    (product.tds_list || []).forEach(t => {
        const item = document.createElement("div");
        item.className = `bom-timeline-item ${t.tds_version === displayTds.tds_version ? 'active' : ''}`;
        
        item.innerHTML = `
            <div class="bom-timeline-header">
                <span>版本: ${t.tds_version}</span>
                <span class="badge ${t.status==='活动'?'badge-green':'badge-gray'}">${t.status}</span>
            </div>
            <div class="bom-timeline-meta" style="margin-top:4px;">
                说明: ${t.notes || '无'}
            </div>
            <div class="bom-timeline-meta" style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
                更新人: ${t.updater} | ${formatDate(t.created_at)}
            </div>
        `;

        item.onclick = () => {
            state.selectedTdsVersion = t.tds_version;
            renderTdsSubpanel();
        };

        timelineEl.appendChild(item);
    });
}

// 打开 TDS 行就地编辑弹窗
window.openTdsRowEditModal = function(idx) {
    if (!checkPermission(["Admin", "Process Engineer", "Quality Engineer"], "编辑TDS规格项")) return;

    const product = state.activeProduct;
    let displayTds = state.selectedTdsVersion
        ? (product.tds_list || []).find(t => t.tds_version === state.selectedTdsVersion)
        : product.tds;
    if (!displayTds) return;

    const item = (displayTds.tds_items || [])[idx];
    if (!item) return;

    document.getElementById("tds-row-edit-idx").value = idx;
    document.getElementById("tds-row-edit-item-no").value = item.item_no !== undefined ? item.item_no : (idx + 1);
    document.getElementById("tds-row-edit-name-zh").value = item.name_zh || '';
    document.getElementById("tds-row-edit-name-en").value = item.name_en || '';
    document.getElementById("tds-row-edit-unit").value = item.unit || '';
    document.getElementById("tds-row-edit-spec").value = item.spec || '';
    document.getElementById("tds-row-edit-standard").value = item.test_standard || '';
    document.getElementById("tds-row-edit-group").value = item.group || '';
    document.getElementById("tds-row-edit-title").innerText = `编辑检验项 #${idx + 1}`;

    openModal("modal-tds-row-edit");
};

// 保存 TDS 行编辑
window.saveTdsRowEdit = function() {
    if (!checkPermission(["Admin", "Process Engineer", "Quality Engineer"], "修改TDS规格项")) return;

    const product = state.activeProduct;
    let displayTds = product.tds;
    if (!displayTds) { showToast("未找到活动 TDS 版本", "error"); return; }

    const idx = parseInt(document.getElementById("tds-row-edit-idx").value);
    const tdsItems = displayTds.tds_items || [];

    const updatedItem = {
        item_no: parseInt(document.getElementById("tds-row-edit-item-no").value) || (idx + 1),
        name_zh: document.getElementById("tds-row-edit-name-zh").value.trim(),
        name_en: document.getElementById("tds-row-edit-name-en").value.trim(),
        unit: document.getElementById("tds-row-edit-unit").value.trim(),
        spec: document.getElementById("tds-row-edit-spec").value.trim(),
        test_standard: document.getElementById("tds-row-edit-standard").value.trim(),
        group: document.getElementById("tds-row-edit-group").value.trim()
    };

    // 评测阶段模式：如果名称留空，自动补充缺省名称
    if (!updatedItem.name_zh) updatedItem.name_zh = "自定义检验项";
    if (!updatedItem.spec) updatedItem.spec = "-";

    if (idx >= 0 && idx < tdsItems.length) {
        tdsItems[idx] = updatedItem;
    } else {
        tdsItems.push(updatedItem);
    }

    // 按项次重新排序
    tdsItems.sort((a, b) => (a.item_no || 0) - (b.item_no || 0));

    _saveTdsItemsToServer(product, tdsItems, "TDS 检验项修改成功！");
    closeModal("modal-tds-row-edit");
};

// 新增 TDS 检验行
window.addTdsNewRow = function() {
    if (!checkPermission(["Admin", "Process Engineer", "Quality Engineer"], "新增TDS检验项")) return;

    const product = state.activeProduct;
    let displayTds = product.tds;
    if (!displayTds) { showToast("未找到活动 TDS 版本", "error"); return; }

    const tdsItems = displayTds.tds_items || [];
    const nextItemNo = tdsItems.length > 0 ? (Math.max(...tdsItems.map(i => i.item_no || 0)) + 1) : 1;

    document.getElementById("tds-row-edit-idx").value = "-1";
    document.getElementById("tds-row-edit-item-no").value = nextItemNo;
    document.getElementById("tds-row-edit-name-zh").value = '';
    document.getElementById("tds-row-edit-name-en").value = '';
    document.getElementById("tds-row-edit-unit").value = '';
    document.getElementById("tds-row-edit-spec").value = '';
    document.getElementById("tds-row-edit-standard").value = '';
    document.getElementById("tds-row-edit-group").value = '';
    document.getElementById("tds-row-edit-title").innerText = `新增检验项`;

    openModal("modal-tds-row-edit");
};

// 删除 TDS 检验行
window.deleteTdsRow = function(idx) {
    if (!checkPermission(["Admin", "Process Engineer", "Quality Engineer"], "删除TDS检验项")) return;

    const product = state.activeProduct;
    let displayTds = product.tds;
    if (!displayTds) return;

    const tdsItems = displayTds.tds_items || [];
    if (idx < 0 || idx >= tdsItems.length) return;

    const name = tdsItems[idx].name_zh || `项次 #${idx+1}`;
    if (!confirm(`确认删除检验项「${name}」？此操作将直接更新当前活动 TDS。`)) return;

    tdsItems.splice(idx, 1);
    _saveTdsItemsToServer(product, tdsItems, `检验项「${name}」已删除。`);
};

// 内部辅助：保存 TDS 数据到服务器
function _saveTdsItemsToServer(product, tdsItems, successMsg) {
    fetch(`/api/products/${product.id}/save_tds_rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tds_items: tdsItems })
    })
    .then(res => res.json())
    .then(data => {
        showToast(successMsg || (data.message + " 受控配方单已同步归档至文管中心 (DMS)！"), "success");
        loadProductDetails(product.id);
    });
}

// 打开发布新版本弹窗
window.openTdsPublishModal = function() {
    if (!checkPermission(["Admin", "Process Engineer", "Quality Engineer"], "发布TDS新版本")) return;
    document.getElementById("tds-publish-notes").value = "";
    document.getElementById("tds-publish-updater").value = "工艺工程师";
    openModal("modal-tds-publish");
};

// 发布新版本
window.publishTdsVersion = function() {
    const product = state.activeProduct;
    if (!product) return;

    const notes = document.getElementById("tds-publish-notes").value.trim();
    const updater = document.getElementById("tds-publish-updater").value.trim();
    if (!notes) {
        showToast("请输入版本变更说明！", "error");
        return;
    }

    const displayTds = product.tds || {};
    const tdsItems = displayTds.tds_items || [];

    fetch(`/api/products/${product.id}/publish_tds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            tds_items: tdsItems,
            notes: notes,
            updater: updater
        })
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message + " 新版技术协议已自动转换为 PDF 受控副本，并在文管中心 (DMS) 实时呈现！", "success");
        closeModal("modal-tds-publish");
        state.selectedTdsVersion = null; // 重置为最新活动版本
        loadProductDetails(product.id);
    });
};

function saveTdsSpecs() {
    // 兼容旧接口逻辑，当点击其他位置触发时仍工作
    const product = state.activeProduct;
    if (!product) return;
    const start = document.getElementById("tds-plan-start").value;
    const end = document.getElementById("tds-plan-end").value;
    const owner = document.getElementById("tds-plan-owner").value;
    saveNpiPlan("gate1", start, end, owner).then(() => {
        showToast("Gate 1 计划负责人更新成功！", "success");
        closeModal("modal-tds-edit");
        loadProductDetails(product.id);
    });
}

// ======================== 管控模块二：配方 BOM 渲染 ========================
function renderBomSubpanel() {
    const product = state.activeProduct;
    const activeVersionBadge = document.getElementById("bom-active-version-badge");
    const tbody = document.querySelector("#bom-items-table tbody");
    const timelineEl = document.getElementById("bom-version-timeline");

    if (!tbody || !timelineEl) return;

    tbody.innerHTML = "";
    timelineEl.innerHTML = "";

    // 1. 判定当前要显示的BOM对象
    let displayBom = null;
    if (state.selectedBomVersion) {
        displayBom = product.bom_list.find(b => b.version === state.selectedBomVersion);
    } else {
        displayBom = product.bom; // 默认为活动BOM
    }

    if (!displayBom) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">暂无可用 BOM 数据，点击右上方「新增物料行」开始录入</td></tr>`;
        return;
    }

    const isActiveBom = displayBom.status === '活动';
    activeVersionBadge.innerText = `BOM 版本: ${displayBom.version} (${displayBom.status})`;
    activeVersionBadge.className = `badge ${isActiveBom ? 'badge-green' : 'badge-gray'}`;

    // 同步显示/隐藏编辑控件（历史版本不可编辑）
    const addRowBtn = document.getElementById("btn-bom-add-row");
    if (addRowBtn) addRowBtn.style.display = isActiveBom ? 'flex' : 'none';

    // 2. 构造 BOM 表格列表
    const bomItems = displayBom.bom_items || [];

    if (bomItems.length === 0) {
        bomItems.push(
            { material_code: "MAT-CU-001", material_name: "高纯铜线", material_spec: "99.99%级", ratio_value: displayBom.copper_wire_ratio, unit: "%" },
            { material_code: "MAT-ACID-001", material_name: "电子级硫酸", material_spec: "98%浓度", ratio_value: displayBom.sulfuric_acid_ratio, unit: "%" },
            { material_code: "AD-GEL-01", material_name: "特种明胶骨胶", material_spec: "生箔添加剂", ratio_value: displayBom.additive_gel, unit: "ppm" },
            { material_code: "AD-HEC-01", material_name: "羟乙基纤维素", material_spec: "生箔添加剂", ratio_value: displayBom.additive_hec, unit: "ppm" },
            { material_code: "AD-SPS-01", material_name: "活性硫整平剂", material_spec: "生箔添加剂", ratio_value: displayBom.additive_s, unit: "ppm" },
            { material_code: "MAT-SILANE-203", material_name: "常规硅烷偶联剂", material_spec: displayBom.silane_type || "常规硅烷-201", ratio_value: displayBom.silane_conc || 0.8, unit: "%" }
        );
    }

    bomItems.forEach((item, idx) => {
        const tr = document.createElement("tr");
        tr.dataset.idx = idx;

        const editBtn = isActiveBom
            ? `<button class="btn-secondary" style="padding:2px 8px; font-size:0.72rem;" onclick="openBomRowEditModal(${idx})">
                    <i data-lucide="edit-3" style="width:11px; height:11px;"></i> 编辑
               </button>
               <button class="btn-secondary" style="padding:2px 6px; font-size:0.72rem; color:var(--color-danger);" onclick="deleteBomRow(${idx})">
                    <i data-lucide="trash-2" style="width:11px; height:11px;"></i>
               </button>`
            : `<span style="color:var(--text-muted); font-size:0.72rem;">只读</span>`;

        tr.innerHTML = `
            <td style="font-family: monospace; font-size: 0.75rem;">${item.material_code}</td>
            <td style="font-weight: 600;">${item.material_name}</td>
            <td style="color: var(--text-secondary);">${item.material_spec}</td>
            <td style="font-weight: bold; color: var(--color-primary);">${item.ratio_value}</td>
            <td>${item.unit}</td>
            <td style="text-align:right; white-space:nowrap;">${editBtn}</td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();

    // 3. 渲染右侧 BOM 版本历史轴
    product.bom_list.forEach(b => {
        const item = document.createElement("div");
        item.className = `bom-timeline-item ${b.version === displayBom.version ? 'active' : ''}`;
        
        item.innerHTML = `
            <div class="bom-timeline-header">
                <span>版本: ${b.version}</span>
                <span class="badge ${b.status==='活动'?'badge-green':'badge-gray'}">${b.status}</span>
            </div>
            <div class="bom-timeline-meta" style="margin-top:4px;">
                说明: 包含 ${(b.bom_items || []).length} 项配方物料
            </div>
            <div class="bom-timeline-meta" style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
                更新人: ${b.updater} | ${formatDate(b.created_at)}
            </div>
        `;

        item.onclick = () => {
            state.selectedBomVersion = b.version;
            renderBomSubpanel();
        };

        timelineEl.appendChild(item);
    });
}

// 打开 BOM 行编辑弹窗
window.openBomRowEditModal = function(idx) {
    if (!checkPermission(["Admin", "Process Engineer"], "编辑配方BOM")) return;

    const product = state.activeProduct;
    let displayBom = state.selectedBomVersion
        ? product.bom_list.find(b => b.version === state.selectedBomVersion)
        : product.bom;
    if (!displayBom) return;

    const item = (displayBom.bom_items || [])[idx];
    if (!item) return;

    document.getElementById("bom-row-edit-idx").value = idx;
    document.getElementById("bom-row-edit-code").value = item.material_code || '';
    document.getElementById("bom-row-edit-name").value = item.material_name || '';
    document.getElementById("bom-row-edit-spec").value = item.material_spec || '';
    document.getElementById("bom-row-edit-ratio").value = item.ratio_value || '';
    document.getElementById("bom-row-edit-unit").value = item.unit || '';
    document.getElementById("bom-row-edit-title").innerText = `编辑物料行 #${idx + 1}`;

    openModal("modal-bom-row-edit");
};

// 保存 BOM 行编辑（就地保存到当前活动 BOM，然后推送到后端）
window.saveBomRowEdit = function() {
    if (!checkPermission(["Admin", "Process Engineer"], "修改配方BOM")) return;

    const product = state.activeProduct;
    let displayBom = product.bom;
    if (!displayBom) { showToast("未找到活动 BOM", "error"); return; }

    const idx = parseInt(document.getElementById("bom-row-edit-idx").value);
    const bomItems = displayBom.bom_items || [];

    const updatedItem = {
        material_code: document.getElementById("bom-row-edit-code").value.trim(),
        material_name: document.getElementById("bom-row-edit-name").value.trim(),
        material_spec: document.getElementById("bom-row-edit-spec").value.trim(),
        ratio_value: parseFloat(document.getElementById("bom-row-edit-ratio").value) || document.getElementById("bom-row-edit-ratio").value,
        unit: document.getElementById("bom-row-edit-unit").value.trim()
    };

    if (idx >= 0 && idx < bomItems.length) {
        bomItems[idx] = updatedItem;
    } else {
        bomItems.push(updatedItem);
    }

    _saveBomItemsToServer(product, bomItems, "物料信息修改成功，BOM 已更新！");
    closeModal("modal-bom-row-edit");
};

// 新增物料行（直接新增到当前活动 BOM）
window.addBomNewRow = function() {
    if (!checkPermission(["Admin", "Process Engineer"], "新增配方BOM行")) return;

    const product = state.activeProduct;
    let displayBom = product.bom;
    if (!displayBom) { showToast("未找到活动 BOM", "error"); return; }

    const bomItems = displayBom.bom_items || [];
    const newIdx = bomItems.length;

    // 先填入空白行，弹窗填写
    bomItems.push({ material_code: '', material_name: '', material_spec: '', ratio_value: '', unit: '' });

    document.getElementById("bom-row-edit-idx").value = newIdx;
    document.getElementById("bom-row-edit-code").value = '';
    document.getElementById("bom-row-edit-name").value = '';
    document.getElementById("bom-row-edit-spec").value = '';
    document.getElementById("bom-row-edit-ratio").value = '';
    document.getElementById("bom-row-edit-unit").value = '';
    document.getElementById("bom-row-edit-title").innerText = `新增物料行`;

    openModal("modal-bom-row-edit");
};

// 删除 BOM 行
window.deleteBomRow = function(idx) {
    if (!checkPermission(["Admin", "Process Engineer"], "删除配方BOM行")) return;

    const product = state.activeProduct;
    let displayBom = product.bom;
    if (!displayBom) return;

    const bomItems = displayBom.bom_items || [];
    if (idx < 0 || idx >= bomItems.length) return;

    const name = bomItems[idx].material_name || `行 #${idx+1}`;
    if (!confirm(`确认删除物料「${name}」？此操作将直接更新当前活动 BOM。`)) return;

    bomItems.splice(idx, 1);
    _saveBomItemsToServer(product, bomItems, `物料「${name}」已删除，BOM 已更新！`);
};

// 内部辅助：将 bomItems 保存到后端（调用在线保存接口，不升版）
function _saveBomItemsToServer(product, bomItems, successMsg) {
    const bom = product.bom;
    if (!bom) return;

    const payload = {
        bom_version: bom.version,
        items: bomItems,
        copper_wire_ratio: bom.copper_wire_ratio,
        sulfuric_acid_ratio: bom.sulfuric_acid_ratio,
        additive_gel: bom.additive_gel,
        additive_hec: bom.additive_hec,
        additive_s: bom.additive_s,
        silane_conc: bom.silane_conc,
        silane_type: bom.silane_type
    };

    fetch(`/api/products/${product.id}/save_bom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        showToast(successMsg || data.message, "success");
        loadProductDetails(product.id);
    });
}

// ======================== 管控模块三：工艺路线 Routing 渲染 ========================
function renderRoutingSubpanel() {
    const product = state.activeProduct;
    const select = document.getElementById("routing-version-select");
    if (!select) return;
    select.innerHTML = "";

    const history = product.routing_history || {};
    const versions = Object.keys(history).sort().reverse();

    versions.forEach(v => {
        const option = document.createElement("option");
        option.value = v;
        const isCurrentActive = history[v].some(step => step.status === '活动');
        option.innerText = isCurrentActive ? `${v} (当前活动)` : `${v} (历史版本)`;
        if (isCurrentActive) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    let selectedVersion = select.value;
    if (!selectedVersion && versions.length > 0) {
        selectedVersion = versions[0];
    }

    select.onchange = (e) => {
        renderRoutingStepsForVersion(e.target.value);
    };

    renderRoutingStepsForVersion(selectedVersion);
}

window.renderRoutingStepsForVersion = function(version) {
    const product = state.activeProduct;
    const container = document.getElementById("routing-steps-container");
    if (!container) return;
    container.innerHTML = "";

    const history = product.routing_history || {};
    const steps = history[version] || [];

    const activeIndex = getStatusActiveIndex(product.status, product.category);
    const stages = getStagesForProduct(product.category);
    const activeStageName = stages[activeIndex];

    steps.forEach((r, idx) => {
        const card = document.createElement("div");
        card.className = "routing-step-card";
        
        const isCurrentActive = r.stage_name === activeStageName && r.status === '活动';
        if (isCurrentActive) {
            card.classList.add("active-step");
        }

        let stdParamsHtml = "";
        for (const [key, val] of Object.entries(r.standard_params)) {
            const field = STAGE_FIELDS[r.stage_name]?.find(f => f.key === key);
            if (field) {
                stdParamsHtml += `
                    <div class="routing-param-card">
                        <div class="routing-param-label">${field.name}</div>
                        <div class="routing-param-val">${val}<span>${field.unit}</span></div>
                    </div>
                `;
            }
        }

        const actualLogs = product.development_logs.filter(l => l.stage === r.stage_name);
        let actualSectionHtml = "";
        
        if (actualLogs.length > 0) {
            const latestLog = actualLogs[actualLogs.length - 1];
            let deviationHtml = "";
            for (const [key, val] of Object.entries(latestLog.parameters)) {
                const field = STAGE_FIELDS[r.stage_name]?.find(f => f.key === key);
                const stdVal = r.standard_params[key];
                
                if (field && stdVal !== undefined) {
                    const dev = parseFloat((val - stdVal).toFixed(4));
                    const isOk = Math.abs(dev) <= field.threshold;
                    
                    let badgeClass = "dev-ok";
                    let labelText = `偏差: ${dev > 0 ? '+' : ''}${dev}`;
                    
                    if (!isOk) {
                        badgeClass = "dev-err";
                        labelText = `超标 ${dev > 0 ? '+' : ''}${dev}`;
                    } else if (Math.abs(dev) > field.threshold * 0.7) {
                        badgeClass = "dev-warn";
                    }

                    deviationHtml += `
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
                            <span>${field.name}: 实测 ${val} / 基准 ${stdVal}</span>
                            <span class="deviation-badge ${badgeClass}">${labelText}</span>
                        </div>
                    `;
                }
            }

            actualSectionHtml = `
                <div class="routing-actual-log-section">
                    <div style="font-weight: 600; font-size: 0.75rem; color: var(--color-primary); margin-bottom: 8px; display: flex; justify-content: space-between;">
                        <span><i data-lucide="check-circle" style="width: 12px; height: 12px; vertical-align: middle;"></i> 生产现场实跑数据偏差诊断:</span>
                        <span style="color: var(--text-muted);">操作人: ${latestLog.operator} | ${formatDate(latestLog.created_at)}</span>
                    </div>
                    ${deviationHtml}
                    ${latestLog.remarks ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 6px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 4px;">操作员备注: ${latestLog.remarks}</div>` : ''}
                </div>
            `;
        } else {
            actualSectionHtml = `
                <div class="routing-actual-log-section" style="color: var(--text-muted); font-size: 0.75rem; text-align: center; border: 1px dashed var(--border-color); background: none;">
                    <i data-lucide="info" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i> 本工序目前尚未录入实际试跑参数，基准工艺指标待检验。
                </div>
            `;
        }

        let entryBtnHtml = "";
        if (isCurrentActive) {
            entryBtnHtml = `<button class="btn-primary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="openProcessLogModal('${r.stage_name}')"><i data-lucide="plus-circle" style="width: 12px; height: 12px;"></i> 录入数据</button>`;
        }

        // 自定义扩展参数展示
        let customParamsHtml = '';
        if (r.custom_params && r.custom_params.length > 0) {
            customParamsHtml = `<div class="routing-actual-log-section" style="margin-top:8px;">
                <div style="font-weight: 600; font-size: 0.75rem; color: var(--text-secondary); margin-bottom:6px;"><i data-lucide="list" style="width:12px; height:12px; vertical-align:middle;"></i> 自定义扩展参数：</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">`;
            r.custom_params.forEach(cp => {
                customParamsHtml += `<div class="routing-param-card"><div class="routing-param-label">${cp.name}</div><div class="routing-param-val">${cp.value}<span>${cp.unit || ''}</span></div></div>`;
            });
            customParamsHtml += '</div></div>';
        }

        // 版本注释展示
        let notesHtml = '';
        if (r.notes) {
            notesHtml = `<div style="font-size:0.72rem; color:var(--text-muted); border-top:1px dashed rgba(255,255,255,0.05); padding-top:6px; margin-top:6px;"><i data-lucide="message-square" style="width:11px;height:11px;vertical-align:middle;"></i> 版本说明：${r.notes}</div>`;
        }

        card.innerHTML = `
            <div class="routing-step-header">
                <span class="routing-step-title">
                    <div class="routing-step-index">${idx + 1}</div>
                    <span>${r.stage_name}</span>
                    ${isCurrentActive ? '<span class="badge badge-blue">当前研发工段</span>' : ''}
                    ${r.status === '历史' ? '<span class="badge badge-gray">历史工艺数据</span>' : ''}
                </span>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <span class="routing-step-device"><i data-lucide="cpu" style="width: 12px; height: 12px; vertical-align: middle;"></i> 推荐机台: ${r.device_name} (${r.device_code})</span>
                    ${r.status === '活动' ? `<button class="btn-secondary" style="padding: 3px 8px; font-size: 0.72rem;" onclick="openStepEditModal(${r.id})"><i data-lucide="edit-3" style="width:11px; height:11px;"></i> 编辑</button>` : ''}
                    ${entryBtnHtml}
                </div>
            </div>
            <div class="routing-params-flex">
                ${stdParamsHtml}
            </div>
            ${customParamsHtml}
            ${actualSectionHtml}
            ${notesHtml}
        `;
        container.appendChild(card);
    });

    const addLogBtn = document.getElementById("btn-add-stage-log-new");
    if (addLogBtn) {
        if (activeStageName && !["立项", "测试验证", "量产送样"].includes(activeStageName)) {
            addLogBtn.style.display = "flex";
            addLogBtn.onclick = () => openProcessLogModal(activeStageName);
        } else {
            addLogBtn.style.display = "none";
        }
    }
    lucide.createIcons();
};

window.openRoutingDesigner = function() {
    const product = state.activeProduct;
    if (!product) return;

    const container = document.getElementById("routing-design-steps-container");
    container.innerHTML = "";

    const currentSteps = product.routing || [];
    if (currentSteps.length === 0) {
        addBlankDesignStep();
    } else {
        currentSteps.forEach(step => {
            addDesignStep(step.stage_name, step.device_name, step.device_code, step.standard_params, step.custom_params);
        });
    }

    openModal("modal-routing-design");
};

window.addBlankDesignStep = function() {
    const defaultParams = { "Cu_conc": 85.0, "H2SO4_conc": 110.0, "temp": 80.0, "flow_rate": 450.0, "Cl_conc": 35.0 };
    addDesignStep("溅镀工段", "新制液溶铜设备", "EQ-溶铜-NEW", defaultParams);
};

window.addDesignStep = function(stageName, deviceName, deviceCode, standardParams, customParams) {
    const container = document.getElementById("routing-design-steps-container");
    const index = container.children.length;
    customParams = customParams || [];

    const wrapper = document.createElement("div");
    wrapper.className = "design-step-item";
    wrapper.style = "background: rgba(30,41,59,0.3); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;";
    
    const product = state.activeProduct;
    const isHis = product.category === 'HIS 载体铜箔';

    const PRESET_STAGES = ["溅镀工段", "电镀工段", "表面处理工段", "分切工段"];
    const isCustomStage = !PRESET_STAGES.includes(stageName);

    let optHtml = PRESET_STAGES.map(s => `<option value="${s}" ${s === stageName && !isCustomStage ? 'selected' : ''}>${s}</option>`).join("");
    optHtml += `<option value="__custom__" ${isCustomStage ? 'selected' : ''}>自定义工段名称…</option>`;

    let customParamsHtml = customParams.map((cp, i) => `
        <div class="custom-param-row" style="display: flex; gap: 6px; align-items: center;">
            <input type="text" class="form-control custom-param-name" placeholder="参数名" value="${cp.name || ''}" style="height:28px; font-size:0.75rem; flex: 2;">
            <input type="text" class="form-control custom-param-value" placeholder="值" value="${cp.value || ''}" style="height:28px; font-size:0.75rem; flex: 1;">
            <input type="text" class="form-control custom-param-unit" placeholder="单位" value="${cp.unit || ''}" style="height:28px; font-size:0.75rem; flex: 1;">
            <button class="btn-secondary" style="padding:2px 6px; font-size:0.7rem; color:var(--color-danger); flex-shrink:0;" onclick="this.closest('.custom-param-row').remove()">✕</button>
        </div>
    `).join("");

    wrapper.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:600; font-size:0.8rem; color:var(--color-primary);">工步 #${index + 1}</span>
            <button class="btn-secondary" style="padding:2px 6px; font-size:0.7rem; color:var(--color-danger); border-color:rgba(239,68,68,0.2);" onclick="removeDesignStep(${index})">
                <i data-lucide="trash-2" style="width:12px; height:12px; vertical-align:middle;"></i> 删除工步
            </button>
        </div>
        <div class="form-row" style="margin-bottom:0;">
            <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:0.75rem;">工序阶段</label>
                <select class="form-control design-stage-name" style="height:32px; font-size:0.8rem;" onchange="onDesignStageChange(this)">
                    ${optHtml}
                </select>
                <input type="text" class="form-control design-stage-custom" placeholder="输入自定义工段名称" value="${isCustomStage ? stageName : ''}" style="height:32px; font-size:0.8rem; margin-top:4px; display:${isCustomStage ? 'block' : 'none'};">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:0.75rem;">推荐机台名称</label>
                <input type="text" class="form-control design-device-name" style="height:32px; font-size:0.8rem;" value="${deviceName}" required>
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:0.75rem;">机台代号</label>
                <input type="text" class="form-control design-device-code" style="height:32px; font-size:0.8rem;" value="${deviceCode}" required>
            </div>
        </div>
        <div class="design-params-area" style="border-top:1px dashed rgba(255,255,255,0.05); padding-top:8px; margin-top:4px;">
            <!-- Injected by sub-render -->
        </div>
        <div class="design-custom-params-area" style="border-top:1px dashed rgba(255,255,255,0.05); padding-top:8px; margin-top:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:0.7rem; color:var(--text-muted); font-weight:600;">自定义扩展参数：</span>
                <button class="btn-secondary" style="padding:1px 6px; font-size:0.68rem;" onclick="addDesignCustomParam(this)">
                    <i data-lucide="plus" style="width:10px; height:10px;"></i> 新增参数
                </button>
            </div>
            <div class="design-custom-params-list" style="display:flex; flex-direction:column; gap:5px;">
                ${customParamsHtml}
            </div>
        </div>
    `;

    container.appendChild(wrapper);
    lucide.createIcons();

    const selectEl = wrapper.querySelector(".design-stage-name");
    renderDesignStepParams(selectEl, standardParams);
};

window.renderDesignStepParams = function(selectEl, standardParams) {
    const stage = selectEl.value;
    const paramsDiv = selectEl.closest(".design-step-item").querySelector(".design-params-area");
    paramsDiv.innerHTML = "";

    const fields = STAGE_FIELDS[stage] || [];
    let fieldsHtml = "";
    
    fields.forEach(f => {
        const val = standardParams[f.key] !== undefined ? standardParams[f.key] : "";
        fieldsHtml += `
            <div style="display:inline-block; width:calc(33% - 8px); margin-right:8px; margin-bottom:6px;">
                <label style="font-size:0.7rem; color:var(--text-secondary); display:block; margin-bottom:2px;">${f.name} (${f.unit})</label>
                <input type="text" class="form-control param-field-input" data-key="${f.key}" style="height:26px; font-size:0.75rem; padding:2px 6px;" value="${val}" required>
            </div>
        `;
    });

    paramsDiv.innerHTML = `
        <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:4px; font-weight:600;">控制基准参数设定：</div>
        ${fieldsHtml}
    `;
};

window.submitNewRoutingDesign = function() {
    const product = state.activeProduct;
    if (!product) return;

    const container = document.getElementById("routing-design-steps-container");
    const items = container.children;

    if (items.length === 0) {
        showToast("工艺路线工步不能为空，请至少添加一个工段。", "error");
        return;
    }

    const steps = [];
    for (let i = 0; i < items.length; i++) {
        const wrapper = items[i];
        const stageSelect = wrapper.querySelector(".design-stage-name");
        let stageName = stageSelect.value;
        if (stageName === '__custom__') {
            const customInput = wrapper.querySelector(".design-stage-custom");
            stageName = (customInput ? customInput.value.trim() : '') || '自定义工段';
        }
        const deviceName = wrapper.querySelector(".design-device-name").value;
        const deviceCode = wrapper.querySelector(".design-device-code").value;

        const paramInputs = wrapper.querySelectorAll(".param-field-input");
        const standardParams = {};
        paramInputs.forEach(input => {
            const key = input.getAttribute("data-key");
            const val = parseFloat(input.value) || input.value;
            standardParams[key] = val;
        });

        const customParams = [];
        wrapper.querySelectorAll(".custom-param-row").forEach(row => {
            const name = row.querySelector(".custom-param-name").value.trim();
            const value = row.querySelector(".custom-param-value").value.trim();
            const unit = row.querySelector(".custom-param-unit").value.trim();
            if (name) customParams.push({ name, value, unit });
        });

        steps.push({
            stage_name: stageName,
            device_name: deviceName,
            device_code: deviceCode,
            standard_params: standardParams,
            custom_params: customParams
        });
    }

    const notes = document.getElementById("routing-version-notes")?.value?.trim() || '';

    fetch(`/api/products/${product.id}/save_routing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: steps, notes: notes })
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, "success");
        closeModal("modal-routing-design");
        loadProductDetails(product.id);
    });
};

// 在工步设计器中新增一行自定义参数
window.addDesignCustomParam = function(btn) {
    const list = btn.closest(".design-custom-params-area").querySelector(".design-custom-params-list");
    const row = document.createElement("div");
    row.className = "custom-param-row";
    row.style = "display: flex; gap: 6px; align-items: center;";
    row.innerHTML = `
        <input type="text" class="form-control custom-param-name" placeholder="参数名" style="height:28px; font-size:0.75rem; flex: 2;">
        <input type="text" class="form-control custom-param-value" placeholder="值" style="height:28px; font-size:0.75rem; flex: 1;">
        <input type="text" class="form-control custom-param-unit" placeholder="单位" style="height:28px; font-size:0.75rem; flex: 1;">
        <button class="btn-secondary" style="padding:2px 6px; font-size:0.7rem; color:var(--color-danger); flex-shrink:0;" onclick="this.closest('.custom-param-row').remove()">✕</button>
    `;
    list.appendChild(row);
};

// 打开单工步就地编辑弹窗
window.openStepEditModal = function(stepId) {
    if (!checkPermission(["Admin", "Process Engineer"], "编辑工艺工步")) return;

    const product = state.activeProduct;
    if (!product) return;

    let targetStep = null;
    for (const ver of Object.values(product.routing_history || {})) {
        targetStep = ver.find(s => s.id === stepId);
        if (targetStep) break;
    }
    if (!targetStep) targetStep = (product.routing || []).find(s => s.id === stepId);
    if (!targetStep) { showToast("找不到该工步记录", "error"); return; }

    document.getElementById("step-edit-id").value = stepId;
    document.getElementById("step-edit-device-name").value = targetStep.device_name || '';
    document.getElementById("step-edit-device-code").value = targetStep.device_code || '';

    const PRESET_STAGES = ["溅镀工段", "电镀工段", "表面处理工段", "分切工段"];
    const stageSelect = document.getElementById("step-edit-stage-select");
    const customInput = document.getElementById("step-edit-stage-custom");
    const isCustom = !PRESET_STAGES.includes(targetStep.stage_name);
    stageSelect.value = isCustom ? '__custom__' : targetStep.stage_name;
    if (isCustom) {
        customInput.style.display = 'block';
        customInput.value = targetStep.stage_name;
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }

    const paramsArea = document.getElementById("step-edit-params-area");
    const fields = STAGE_FIELDS[targetStep.stage_name] || [];
    let paramsHtml = '';
    if (fields.length > 0) {
        paramsHtml = `<div style="font-size:0.7rem; color:var(--text-muted); font-weight:600; margin-bottom:6px;">预设控制参数：</div><div style="display:flex; flex-wrap:wrap; gap:8px;">`;
        fields.forEach(f => {
            const val = (targetStep.standard_params || {})[f.key] !== undefined ? (targetStep.standard_params || {})[f.key] : '';
            paramsHtml += `<div style="flex: 0 0 calc(33% - 6px);"><label style="font-size:0.7rem; color:var(--text-secondary); display:block; margin-bottom:2px;">${f.name} (${f.unit})</label><input type="text" class="form-control step-edit-param-field" data-key="${f.key}" value="${val}" style="height:28px; font-size:0.78rem;"></div>`;
        });
        paramsHtml += '</div>';
    } else {
        paramsHtml = `<div style="color:var(--text-muted); font-size:0.78rem; text-align:center; padding:10px;">此工段无预设控制参数，可使用下方自定义参数录入。</div>`;
    }
    paramsArea.innerHTML = paramsHtml;

    const customParamsArea = document.getElementById("step-edit-custom-params");
    customParamsArea.innerHTML = '';
    (targetStep.custom_params || []).forEach(cp => addStepEditCustomParamRow(cp.name, cp.value, cp.unit));

    openModal("modal-step-edit");
};

// 自定义工段切换（单步编辑弹窗）
window.onStepEditStageSelectChange = function(sel) {
    const customInput = document.getElementById("step-edit-stage-custom");
    if (sel.value === '__custom__') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        const fields = STAGE_FIELDS[sel.value] || [];
        const paramsArea = document.getElementById("step-edit-params-area");
        let html = '';
        if (fields.length > 0) {
            html = `<div style="font-size:0.7rem; color:var(--text-muted); font-weight:600; margin-bottom:6px;">预设控制参数：</div><div style="display:flex; flex-wrap:wrap; gap:8px;">`;
            fields.forEach(f => { html += `<div style="flex: 0 0 calc(33% - 6px);"><label style="font-size:0.7rem; color:var(--text-secondary); display:block; margin-bottom:2px;">${f.name} (${f.unit})</label><input type="text" class="form-control step-edit-param-field" data-key="${f.key}" value="" style="height:28px; font-size:0.78rem;"></div>`; });
            html += '</div>';
        } else {
            html = `<div style="color:var(--text-muted); font-size:0.78rem; text-align:center; padding:10px;">此工段无预设控制参数。</div>`;
        }
        paramsArea.innerHTML = html;
    }
};

// 新步就地编辑弹窗 - 新增自定义参数行
window.addStepEditCustomParam = function() { addStepEditCustomParamRow('', '', ''); };

function addStepEditCustomParamRow(name, value, unit) {
    const area = document.getElementById("step-edit-custom-params");
    const row = document.createElement("div");
    row.className = "custom-param-row";
    row.style = "display: flex; gap: 6px; align-items: center;";
    row.innerHTML = `
        <input type="text" class="form-control custom-param-name" placeholder="参数名" value="${name}" style="height:28px; font-size:0.75rem; flex: 2;">
        <input type="text" class="form-control custom-param-value" placeholder="值" value="${value}" style="height:28px; font-size:0.75rem; flex: 1;">
        <input type="text" class="form-control custom-param-unit" placeholder="单位" value="${unit}" style="height:28px; font-size:0.75rem; flex: 1;">
        <button class="btn-secondary" style="padding:2px 6px; font-size:0.7rem; color:var(--color-danger); flex-shrink:0;" onclick="this.closest('.custom-param-row').remove()">✕</button>
    `;
    area.appendChild(row);
}

// 保存单步就地微调
window.saveStepEdit = function() {
    if (!checkPermission(["Admin", "Process Engineer"], "保存并提交工艺微调")) return;

    const product = state.activeProduct;
    if (!product) return;

    const stepId = parseInt(document.getElementById("step-edit-id").value);
    const stageSelect = document.getElementById("step-edit-stage-select");
    let stageName = stageSelect.value;
    if (stageName === '__custom__') {
        stageName = document.getElementById("step-edit-stage-custom").value.trim() || '自定义工段';
    }
    const deviceName = document.getElementById("step-edit-device-name").value.trim();
    const deviceCode = document.getElementById("step-edit-device-code").value.trim();

    const standardParams = {};
    document.querySelectorAll("#step-edit-params-area .step-edit-param-field").forEach(input => {
        const key = input.getAttribute("data-key");
        const val = parseFloat(input.value) || input.value;
        if (key) standardParams[key] = val;
    });

    const customParams = [];
    document.querySelectorAll("#step-edit-custom-params .custom-param-row").forEach(row => {
        const name = row.querySelector(".custom-param-name").value.trim();
        const value = row.querySelector(".custom-param-value").value.trim();
        const unit = row.querySelector(".custom-param-unit").value.trim();
        if (name) customParams.push({ name, value, unit });
    });

    fetch(`/api/products/${product.id}/update_routing_step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: stepId, stage_name: stageName, device_name: deviceName, device_code: deviceCode, standard_params: standardParams, custom_params: customParams })
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, "success");
        closeModal("modal-step-edit");
        loadProductDetails(product.id);
    });
};

// Fetch ECN list
function fetchEcns() {
    fetch("/api/ecns")
        .then(res => res.json())
        .then(ecns => {
            state.ecns = ecns;
            renderEcnTable(ecns);
        });
}

function renderEcnTable(ecns) {
    const tbody = document.querySelector("#ecn-main-table tbody");
    tbody.innerHTML = "";

    if (ecns.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted);">暂无工程设变单记录</td></tr>`;
        return;
    }

    ecns.forEach(e => {
        const tr = document.createElement("tr");
        
        let riskText = "";
        if (e.risk_assessment) {
            riskText = `剥离: ${e.risk_assessment.peel_effect || '--'}<br>Df损耗: ${e.risk_assessment.df_effect || '--'}`;
        }

        let actionBtn = "";
        if (e.status === "草稿") {
            actionBtn = `<button class="btn-primary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="submitDingTalkApproval(${e.id}, 'ECN')"><i data-lucide="send" style="width: 12px; height: 12px;"></i> 送审</button>`;
        } else if (e.status === "钉钉审批中") {
            actionBtn = `<span style="font-size: 0.75rem; color: var(--text-warning);"><i data-lucide="clock" style="width: 12px; height: 12px; vertical-align: middle;"></i> 审批中</span>`;
        } else {
            actionBtn = `<span style="font-size: 0.75rem; color: var(--text-muted);"><i data-lucide="check" style="width: 12px; height: 12px; vertical-align: middle;"></i> 归档</span>`;
        }

        tr.innerHTML = `
            <td style="font-weight: 600;">${e.ecn_no}</td>
            <td>${e.product_code}</td>
            <td><span class="badge badge-purple">${e.change_type}</span></td>
            <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${e.change_reason}">${e.change_reason}</td>
            <td style="font-size: 0.75rem;">${e.change_before}</td>
            <td style="font-size: 0.75rem;">${e.change_after}</td>
            <td style="font-size: 0.75rem; color: var(--text-secondary);">${riskText}</td>
            <td><span class="badge ${getEcnStatusBadgeClass(e.status)}">${e.status}</span></td>
            <td>${e.creator}</td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

// Fetch DingTalk configurations
function fetchDingTalkSettings() {
    fetch("/api/dingtalk/settings")
        .then(res => res.json())
        .then(s => {
            document.getElementById("ding-appkey").value = s.app_key;
            document.getElementById("ding-appsecret").value = s.app_secret;
            document.getElementById("ding-agentid").value = s.agent_id;
            document.getElementById("ding-mockmode").value = s.is_mock_mode;
            document.getElementById("ding-process-project").value = s.process_code_project;
            document.getElementById("ding-process-ecn").value = s.process_code_ecn;
        });
}

function saveDingTalkSettings(e) {
    e.preventDefault();
    const payload = {
        app_key: document.getElementById("ding-appkey").value,
        app_secret: document.getElementById("ding-appsecret").value,
        agent_id: document.getElementById("ding-agentid").value,
        is_mock_mode: document.getElementById("ding-mockmode").value,
        process_code_project: document.getElementById("ding-process-project").value,
        process_code_ecn: document.getElementById("ding-process-ecn").value
    };

    fetch("/api/dingtalk/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, "success");
    });
}

function submitDingTalkApproval(id, type) {
    let url = "";
    if (type === "PRODUCT") {
        url = `/api/products/${id}/submit_approval`;
    } else if (type === "ECN") {
        url = `/api/ecns/${id}/submit_approval`;
    }

    fetch(url, { method: "POST" })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                showToast(data.error, "error");
            } else {
                showToast("工作流发起成功！请前往 钉钉协同配置 板块的 调试台 决策审批以推进生命周期状态。", "success");
                fetchDashboardData();
                fetchDingTalkApprovals();
                if (state.activeProductId) {
                    loadProductDetails(state.activeProductId);
                }
            }
        });
}

function fetchDingTalkApprovals() {
    fetch("/api/dingtalk/approvals")
        .then(res => res.json())
        .then(logs => {
            state.dingtalkLogs = logs;
            if (state.activeTab === 'dingtalk-panel') {
                renderDingTalkDebugTable(logs);
            }
        });
}

function renderDingTalkDebugTable(logs) {
    const tbody = document.querySelector("#dingtalk-debug-table tbody");
    tbody.innerHTML = "";

    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">暂无任何推送至钉钉的审批流记录</td></tr>`;
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement("tr");
        
        let detailsHtml = "";
        if (log.related_type === "PRODUCT") {
            detailsHtml = `<strong>立项产品:</strong> ${log.content.name} (${log.content.code})<br>
                           <strong>技术规格:</strong> 厚度 ${log.content.spec_thickness}μm / 粗糙度 <= ${log.content.target_roughness}μm / Df <= ${log.content.target_df}`;
        } else {
            detailsHtml = `<strong>ECN单号:</strong> ${log.content.ecn_no}<br>
                           <strong>变更类型:</strong> ${log.content.change_type}<br>
                           <strong>原因为:</strong> ${log.content.change_reason}`;
        }

        let optBtn = "";
        if (log.status === "RUNNING") {
            optBtn = `
                <div style="display: flex; gap: 8px;">
                    <button class="btn-primary" style="padding: 4px 8px; font-size: 0.75rem; background: var(--color-success);" onclick="handleMockApprove('${log.instance_id}', 'AGREE')">模拟同意</button>
                    <button class="btn-primary" style="padding: 4px 8px; font-size: 0.75rem; background: var(--color-danger);" onclick="handleMockApprove('${log.instance_id}', 'REJECT')">模拟拒绝</button>
                </div>
            `;
        } else {
            optBtn = `<span style="font-size: 0.75rem; color: var(--text-muted);">已决人: ${log.approver || '系统'} | 意见: ${log.comment || '无'}</span>`;
        }

        let statusBadge = "";
        if (log.status === "RUNNING") statusBadge = '<span class="badge badge-warning">待审批 (RUNNING)</span>';
        else if (log.status === "COMPLETED") statusBadge = '<span class="badge badge-green">已通过 (COMPLETED)</span>';
        else statusBadge = '<span class="badge badge-danger">已驳回 (REJECTED)</span>';

        tr.innerHTML = `
            <td style="font-family: monospace; font-size: 0.75rem;">${log.instance_id}</td>
            <td><span class="badge badge-purple">${log.related_type === 'PRODUCT' ? '新品立项' : 'ECN设变'}</span></td>
            <td>ID: ${log.related_id}</td>
            <td style="font-size: 0.75rem; line-height: 1.5;">${detailsHtml}</td>
            <td style="font-size: 0.75rem;">${formatDate(log.created_at)}</td>
            <td>${statusBadge}</td>
            <td>${optBtn}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Handle Mock Approval inside the configuration tab debug table
window.handleMockApprove = function(instanceId, action) {
    const comment = action === 'AGREE' ? '沙箱环境：技术指标与合规审查通过，同意变更并自动生成下一版 BOM 配方。' : '沙箱环境：工艺风险评估不通过，驳回。';
    const approver = action === 'AGREE' ? '高频研发部总监' : '品质管理部总监';

    fetch("/api/dingtalk/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            instance_id: instanceId,
            action: action,
            approver: approver,
            comment: comment
        })
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, "success");
        fetchDashboardData();
        fetchDingTalkApprovals();
        if (state.activeProductId) {
            loadProductDetails(state.activeProductId);
        }
        if (state.activeTab === 'ecn-panel') {
            fetchEcns();
        }
    });
};

// Modal Control
window.openModal = function(id) {
    document.getElementById(id).classList.add("active");
};

window.closeModal = function(id) {
    document.getElementById(id).classList.remove("active");
};

window.toggleProjectPlanSetup = function() {
    const box = document.getElementById("proj-plan-detail-box");
    const btn = document.getElementById("proj-plan-toggle-btn");
    if (box.style.display === "none") {
        box.style.display = "flex";
        btn.innerHTML = "折叠详细设置 &uarr;";
    } else {
        box.style.display = "none";
        btn.innerHTML = "展开详细设置 &darr;";
    }
};

window.autoCalculateProjectPlanDates = function() {
    const baseDateStr = document.getElementById("proj-plan-base-date").value;
    if (!baseDateStr) return;

    const base = new Date(baseDateStr);
    const addDays = (d, days) => {
        const copy = new Date(d);
        copy.setDate(copy.getDate() + days);
        return copy.toISOString().split('T')[0];
    };

    const creator = document.getElementById("proj-creator").value || "李建国";

    // G1 (0~5天)
    document.getElementById("plan-g1-start").value = addDays(base, 0);
    document.getElementById("plan-g1-end").value = addDays(base, 5);
    document.getElementById("plan-g1-owner").value = creator;

    // G2 (6~12天)
    document.getElementById("plan-g2-start").value = addDays(base, 6);
    document.getElementById("plan-g2-end").value = addDays(base, 12);
    document.getElementById("plan-g2-owner").value = "李建国";

    // G3 (13~25天)
    document.getElementById("plan-g3-start").value = addDays(base, 13);
    document.getElementById("plan-g3-end").value = addDays(base, 25);
    document.getElementById("plan-g3-owner").value = "赵立功";

    // G4 (26~35天)
    document.getElementById("plan-g4-start").value = addDays(base, 26);
    document.getElementById("plan-g4-end").value = addDays(base, 35);
    document.getElementById("plan-g4-owner").value = "钱品质";

    // G5 (36~45天)
    document.getElementById("plan-g5-start").value = addDays(base, 36);
    document.getElementById("plan-g5-end").value = addDays(base, 45);
    document.getElementById("plan-g5-owner").value = "孙生产";
};

function openProjectModal() {
    openModal("modal-project");
    document.getElementById("proj-category").value = "PTS2 AI 铜箔";
    updateThicknessOptions("PTS2 AI 铜箔");

    // 默认今日为启动日期并自动推算 5 大阶段
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById("proj-plan-base-date").value = todayStr;
    autoCalculateProjectPlanDates();
}

function autoDeriveProjectNameAndCode() {
    const cat = document.getElementById("proj-category").value;
    if (!cat) return;

    // 1. 匹配缩写
    let catAbbr = "PTS-AI";
    if (cat === "PTS2 AI 铜箔") catAbbr = "PTS-AI";
    else if (cat === "HIS 载体铜箔") catAbbr = "HIS-Carrier";

    // 2. 动态分析当前 state.products 提取最大流水号
    let maxNum = 0;
    if (state.products && state.products.length > 0) {
        state.products.forEach(p => {
            if (p.category === cat) {
                const parts = p.code.split("-");
                const lastPart = parts[parts.length - 1];
                const num = parseInt(lastPart, 10);
                if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                }
            }
        });
    }

    // 3. 自增下一个流水号并格式化为两位数
    const nextNum = maxNum + 1;
    const formattedNum = nextNum < 10 ? `0${nextNum}` : `${nextNum}`;
    const code = `${catAbbr}-${formattedNum}`;

    document.getElementById("proj-code").value = code;

    // 4. 品名支持自定义：只有在当前输入为空时才自动填充默认类别名建议，绝不覆盖用户已填入的自定义品名
    const nameInput = document.getElementById("proj-name");
    if (nameInput && !nameInput.value.trim()) {
        nameInput.value = cat;
    }
}

function submitNewProject() {
    const payload = {
        code: document.getElementById("proj-code").value.trim(),
        name: document.getElementById("proj-name").value.trim(),
        category: document.getElementById("proj-category").value,
        spec_thickness: parseFloat(document.getElementById("proj-thickness").value) || 0,
        surface_treatment: document.getElementById("proj-surface-treatment").value,
        target_roughness: parseFloat(document.getElementById("proj-roughness").value) || 0,
        target_peel: parseFloat(document.getElementById("proj-peel").value) || 0,
        target_df: parseFloat(document.getElementById("proj-df").value) || 0,
        target_tensile: parseFloat(document.getElementById("proj-tensile").value) || 0,
        target_elongation: parseFloat(document.getElementById("proj-elongation").value) || 0,
        creator: document.getElementById("proj-creator").value.trim(),
        npi_project_plan: {
            gate1: {
                start_date: document.getElementById("plan-g1-start").value,
                plan_end_date: document.getElementById("plan-g1-end").value,
                owner: document.getElementById("plan-g1-owner").value.trim()
            },
            gate2: {
                start_date: document.getElementById("plan-g2-start").value,
                plan_end_date: document.getElementById("plan-g2-end").value,
                owner: document.getElementById("plan-g2-owner").value.trim()
            },
            gate3: {
                start_date: document.getElementById("plan-g3-start").value,
                plan_end_date: document.getElementById("plan-g3-end").value,
                owner: document.getElementById("plan-g3-owner").value.trim()
            },
            gate4: {
                start_date: document.getElementById("plan-g4-start").value,
                plan_end_date: document.getElementById("plan-g4-end").value,
                owner: document.getElementById("plan-g4-owner").value.trim()
            },
            gate5: {
                start_date: document.getElementById("plan-g5-start").value,
                plan_end_date: document.getElementById("plan-g5-end").value,
                owner: document.getElementById("plan-g5-owner").value.trim()
            }
        }
    };

    if (!payload.code || !payload.name) {
        showToast("请填写完整立项基本信息！", "error");
        return;
    }

    // 简单校验排期定义是否填写完整
    const plan = payload.npi_project_plan;
    for (let key in plan) {
        if (!plan[key].start_date || !plan[key].plan_end_date || !plan[key].owner) {
            showToast("请确保 NPI 开发各阶段的开始日期、计划完成日期及负责人已填写完整！", "error");
            return;
        }
    }

    fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, "error");
        } else {
            showToast(data.message, "success");
            closeModal("modal-project");
            fetchDashboardData();
            state.activeProductId = data.product_id;
            switchTab('plm-panel');
            loadProductDetails(data.product_id);
        }
    });
}

// Open Process parameter entry modal
function openProcessLogModal(stageName) {
    document.getElementById("log-stage").value = stageName;
    document.getElementById("modal-process-title").innerText = `${stageName} - 录入现场生产实测参数`;
    
    // 获取该工序的参数字段定义
    const fields = STAGE_FIELDS[stageName];
    const container = document.getElementById("dynamic-params-fields");
    container.innerHTML = "";

    const activeProduct = state.activeProduct;
    // 获取工艺路线该工段的推荐设备
    const route = activeProduct.routing.find(r => r.stage_name === stageName);

    if (route) {
        document.getElementById("log-device-name").value = route.device_name;
        document.getElementById("log-device-code").value = route.device_code;
        
        // 自动将基准参数填入输入框，作为默认建议值
        fields.forEach(f => {
            const stdVal = route.standard_params[f.key] !== undefined ? route.standard_params[f.key] : '';
            const wrap = document.createElement("div");
            wrap.className = "form-group";
            wrap.innerHTML = `<label>${f.name} ${f.unit ? `(${f.unit})` : ''} - 基准推荐: ${stdVal}</label>`;
            wrap.innerHTML += `<input type="number" step="0.0001" class="form-control dyn-input" data-key="${f.key}" value="${stdVal}">`;
            container.appendChild(wrap);
        });
    }

    openModal("modal-process-log");
}

function submitProcessLog() {
    const product = state.activeProduct;
    if (!product) return;

    const payload = {
        stage: document.getElementById("log-stage").value,
        device_name: document.getElementById("log-device-name").value,
        device_code: document.getElementById("log-device-code").value,
        operator: document.getElementById("log-operator").value,
        remarks: document.getElementById("log-remarks").value,
        parameters: {}
    };

    document.querySelectorAll(".dyn-input").forEach(input => {
        const key = input.getAttribute("data-key");
        const val = input.value;
        payload.parameters[key] = isNaN(val) || val === '' ? val : parseFloat(val);
    });

    fetch(`/api/products/${product.id}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, "success");
        closeModal("modal-process-log");
        loadProductDetails(product.id);
        fetchDashboardData();
    });
}

// Quality validation record entry
document.getElementById("btn-add-test-record").onclick = () => {
    const product = state.activeProduct;
    if (!product) return;

    document.getElementById("test-thickness").value = product.spec_thickness;
    document.getElementById("test-roughness-m").value = (product.target_roughness - 0.05).toFixed(2);
    document.getElementById("test-roughness-s").value = (product.target_roughness * 0.4).toFixed(2);
    document.getElementById("test-peel").value = (product.target_peel + 0.05).toFixed(2);
    document.getElementById("test-df").value = (product.target_df - 0.0001).toFixed(4);
    document.getElementById("test-tensile").value = product.target_tensile + 10;
    document.getElementById("test-elongation").value = (product.target_elongation + 0.5).toFixed(1);

    openModal("modal-test-record");
};

function submitTestRecord() {
    const product = state.activeProduct;
    if (!product) return;

    const payload = {
        actual_thickness: document.getElementById("test-thickness").value,
        roughness_rz_m: document.getElementById("test-roughness-m").value,
        roughness_rz_s: document.getElementById("test-roughness-s").value,
        peel_strength: document.getElementById("test-peel").value,
        df_10ghz: document.getElementById("test-df").value,
        tensile_strength: document.getElementById("test-tensile").value,
        elongation: document.getElementById("test-elongation").value,
        tester: document.getElementById("test-tester").value
    };

    fetch(`/api/products/${product.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.test_result === "合格") {
            showToast(`检测通过！TDS 规格比对结果为：合格。准予量产验证！`, "success");
        } else {
            showToast(`检测不合格！原因：${data.reasons.join('; ')}。已重新锁回工艺控制阶段！`, "error");
        }
        closeModal("modal-test-record");
        loadProductDetails(product.id);
        fetchDashboardData();
    });
}

// ECN Modals Open
function openEcnModal() {
    const select = document.getElementById("ecn-product-select");
    select.innerHTML = "";
    state.products.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.innerText = `${p.name} (${p.code})`;
        select.appendChild(opt);
    });
    openModal("modal-ecn");
}

function openEcnModalWithProduct(productId) {
    openEcnModal();
    document.getElementById("ecn-product-select").value = productId;
}

function submitNewEcn() {
    const riskPeel = document.querySelector("#risk-peel-group .risk-option.selected").getAttribute("data-val");
    const riskDf = document.querySelector("#risk-df-group .risk-option.selected").getAttribute("data-val");

    const payload = {
        product_id: document.getElementById("ecn-product-select").value,
        change_type: document.getElementById("ecn-change-type").value,
        change_reason: document.getElementById("ecn-change-reason").value,
        change_before: document.getElementById("ecn-change-before").value,
        change_after: document.getElementById("ecn-change-after").value,
        risk_assessment: {
            peel_effect: riskPeel,
            df_effect: riskDf
        },
        creator: document.getElementById("ecn-creator").value
    };

    if (!payload.change_reason || !payload.change_before || !payload.change_after) {
        showToast("请填写完整的设变参数！", "error");
        return;
    }

    fetch("/api/ecns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, "success");
        closeModal("modal-ecn");
        fetchEcns();
        fetchDashboardData();
    });
}

function renderNpiDeliverables(product) {
    const grid = document.getElementById("npi-deliverables-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const workflow = product.npi_workflow;
    if (!workflow) return;

    const deliverablesConfig = {
        gate1: {
            title: "G1. 立项与目标",
            badge: "立项阶段",
            files: [
                { name: "高频铜箔开发申请书", code: "NPI_Project_Proposal.pdf" },
                { name: "技术协议规格定义书(TDS)", code: "Technical_Agreement_TDS.pdf" },
                { name: "研发可行性分析对标报告", code: "Feasibility_Benchmark.pdf" }
            ]
        },
        gate2: {
            title: "G2. 配方定型 (EVT)",
            badge: "设计定型",
            files: [
                { name: "首发配方清单(BOM V1.0)", code: "Formulation_BOM_V1.0.xlsx" },
                { name: "电解液组分化学检测规范", code: "Electrolyte_Chemistry_Spec.pdf" },
                { name: "铜箔金相微观晶粒分析报告", code: "Grain_SEM_Analysis.pdf" }
            ]
        },
        gate3: {
            title: "G3. 工艺与中试 (DVT)",
            badge: "中试工艺",
            files: [
                { name: "中试工艺路线图与参数卡", code: "DVT_Routing_Card.xlsx" },
                { name: "生箔阴极辊工艺偏离报告", code: "Drum_Deviation_Study.pdf" },
                { name: "中试首批次物性测试报告", code: "DVT_Trial_Physical_Report.pdf" }
            ]
        },
        gate4: {
            title: "G4. 生产验证 (PVT)",
            badge: "量产验证",
            files: [
                { name: "量产机台稳定性负荷评估", code: "PVT_Mass_Validation.pdf" },
                { name: "生箔工艺Cpk波动分析看板", code: "Process_Cpk_Report.xlsx" },
                { name: "型式试验及可靠性测试报告", code: "Type_Test_Reliability_Report.pdf" }
            ]
        },
        gate5: {
            title: "G5. PPAP 与量产 (MP)",
            badge: "封档量产",
            files: [
                { name: "生产件批准程序保证书(PPAP)", code: "PPAP_PSW_Signoff.pdf" },
                { name: "量产控制计划书(Control Plan)", code: "Mass_Control_Plan.pdf" },
                { name: "失效模式分析报告(PFMEA)", code: "PFMEA_Copper_Foil_Line.xlsx" }
            ]
        }
    };

    const keys = ["gate1", "gate2", "gate3", "gate4", "gate5"];
    
    keys.forEach(k => {
        const gateData = workflow[k];
        const config = deliverablesConfig[k];
        if (!gateData || !config) return;

        const card = document.createElement("div");
        card.style.background = "rgba(30, 41, 59, 0.3)";
        card.style.border = "1px solid var(--border-color)";
        card.style.borderRadius = "8px";
        card.style.padding = "12px";
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.style.gap = "8px";
        card.style.transition = "var(--transition-smooth)";
        
        // 动态设置卡片边框高亮
        if (gateData.status === "COMPLETED") {
            card.style.borderColor = "rgba(16, 185, 129, 0.3)";
        } else if (gateData.status === "RUNNING" || gateData.status === "APPROVING") {
            card.style.borderColor = "rgba(59, 130, 246, 0.4)";
            card.style.background = "rgba(59, 130, 246, 0.02)";
        }

        // 门禁状态徽章
        let statusBadge = "";
        let isLocked = false;
        if (gateData.status === "COMPLETED") {
            statusBadge = `<span class="badge badge-green" style="font-size:0.65rem; padding: 2px 6px;">已归档 &check;</span>`;
        } else if (gateData.status === "RUNNING") {
            statusBadge = `<span class="badge badge-blue" style="font-size:0.65rem; padding: 2px 6px;">编写中 &middot;</span>`;
        } else if (gateData.status === "APPROVING") {
            statusBadge = `<span class="badge badge-warning" style="font-size:0.65rem; padding: 2px 6px;">待评审 &middot;</span>`;
        } else if (gateData.status === "FAILED") {
            statusBadge = `<span class="badge badge-danger" style="font-size:0.65rem; padding: 2px 6px;">待修改 &times;</span>`;
        } else {
            statusBadge = `<span class="badge badge-gray" style="font-size:0.65rem; padding: 2px 6px;">锁定 &padlock;</span>`;
            isLocked = true;
        }

        let filesHtml = "";
        config.files.forEach(f => {
            const isExcel = f.code.endsWith(".xlsx");
            const iconName = isExcel ? "file-spreadsheet" : "file-text";
            const iconColor = isLocked ? "var(--text-muted)" : (gateData.status === "COMPLETED" ? "var(--color-success)" : "var(--color-primary)");
            
            if (isLocked) {
                filesHtml += `
                    <div style="font-size: 0.72rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; padding: 4px 0;">
                        <i data-lucide="lock" style="width: 12px; height: 12px; flex-shrink: 0;"></i>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.name}">${f.name}</span>
                    </div>
                `;
            } else {
                filesHtml += `
                    <a href="#" class="npi-file-link" style="font-size: 0.72rem; color: var(--text-primary); text-decoration: none; display: flex; align-items: center; gap: 6px; padding: 4px 0; transition: var(--transition-smooth);" 
                       onclick="showToast('已启动 NPI 归档文件下载：${f.code}', 'success')">
                        <i data-lucide="${iconName}" style="width: 12px; height: 12px; color: ${iconColor}; flex-shrink: 0;"></i>
                        <span class="file-name" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.name}">${f.name}</span>
                    </a>
                `;
            }
        });

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 6px; margin-bottom: 2px;">
                <span style="font-size: 0.65rem; color: var(--text-secondary); font-weight: 500;">${config.badge}</span>
                ${statusBadge}
            </div>
            <h4 style="font-size: 0.78rem; font-weight: 600; color: var(--text-primary); margin: 4px 0 2px 0;">${config.title}</h4>
            <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 4px;">
                ${filesHtml}
            </div>
        `;
        
        grid.appendChild(card);
    });

    lucide.createIcons({
        attrs: {
            "stroke-width": 2
        },
        nameAttr: "data-lucide",
        node: grid
    });
}

function showToast(message, type = "info") {
    const toast = document.getElementById("system-toast");
    const icon = document.getElementById("toast-icon");
    const msgSpan = document.getElementById("toast-message");

    toast.className = `toast active ${type}`;
    msgSpan.innerText = message;

    const iconMap = {
        'success': 'check-circle',
        'error': 'alert-triangle',
        'warning': 'alert-circle',
        'info': 'info'
    };
    icon.setAttribute("data-lucide", iconMap[type] || 'info');
    lucide.createIcons();

    setTimeout(() => {
        toast.classList.remove("active");
    }, 4000);
}

function formatDate(dateStr) {
    if (!dateStr) return "--";
    try {
        const d = new Date(dateStr.replace(" ", "T"));
        if (isNaN(d.getTime())) return dateStr;
        return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    } catch(e) {
        return dateStr;
    }
}

// Render Dashboard Data Charts
function renderDashboardCharts(products) {
    const statusCounts = {};
    products.forEach(p => {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
    });

    const statusColors = {
        "立项中": "#64748b",
        "钉钉立项审批中": "#f59e0b",
        "溶铜造液中": "#06b6d4",
        "溅镀开发中": "#8b5cf6",
        "生箔电镀中": "#3b82f6",
        "表面处理中": "#0ea5e9",
        "分切包装中": "#6366f1",
        "测试验证中": "#ec4899",
        "量产中": "#10b981"
    };

    const labels = Object.keys(statusCounts);
    const data = Object.values(statusCounts);
    const backgroundColors = labels.map(l => statusColors[l] || '#fff');

    if (state.charts.lifecycle) {
        state.charts.lifecycle.destroy();
    }

    const ctxDoughnut = document.getElementById("chart-doughnut-lifecycle").getContext("2d");
    state.charts.lifecycle = new Chart(ctxDoughnut, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 1,
                borderColor: '#1e293b'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#94a3b8',
                        font: { size: 9 }
                    }
                }
            }
        }
    });

    const dbj18 = products.find(p => p.code === "HF-DBJ-18");
    const his02 = products.find(p => p.code === "HF-HIS-02");
    const pts12 = products.find(p => p.code === "HF-PTS-12");

    const getRadarMetrics = (p, isTargetOnly = false) => {
        if (!p) return [0, 0, 0, 0, 0];
        
        const isTarget = isTargetOnly || !p.test_records || p.test_records.length === 0;
        const df = isTarget ? p.target_df : p.test_records[0].df_10ghz;
        const peel = isTarget ? p.target_peel : p.test_records[0].peel_strength;
        const rz = isTarget ? p.target_roughness : p.test_records[0].roughness_rz_m;
        const tensile = isTarget ? p.target_tensile : p.test_records[0].tensile_strength;
        const elongation = isTarget ? p.target_elongation : p.test_records[0].elongation;

        return [
            parseFloat((0.001 / df).toFixed(2)),
            peel,
            parseFloat((1.0 / rz).toFixed(2)),
            tensile / 350.0,
            elongation / 4.0
        ];
    };

    if (state.charts.performance) {
        state.charts.performance.destroy();
    }

    const ctxRadar = document.getElementById("chart-radar-performance").getContext("2d");
    state.charts.performance = new Chart(ctxRadar, {
        type: 'radar',
        data: {
            labels: ['高频损耗指数(1/Df)', '剥离结合强度(N/mm)', '超低粗糙度指数(1/Rz)', '抗拉拉伸极限指数', '塑性延伸率指数'],
            datasets: [
                {
                    label: pts12 ? pts12.code + " (PTS AI 目标)" : "PTS AI铜箔",
                    data: getRadarMetrics(pts12, true),
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    pointBackgroundColor: '#3b82f6'
                },
                {
                    label: his02 ? his02.code + " (HIS 载体实测)" : "HIS 载体箔",
                    data: getRadarMetrics(his02),
                    backgroundColor: 'rgba(139, 92, 246, 0.15)',
                    borderColor: '#8b5cf6',
                    borderWidth: 2,
                    pointBackgroundColor: '#8b5cf6'
                },
                {
                    label: dbj18 ? dbj18.code + " (DBJ 双晶实测)" : "背板双晶箔",
                    data: getRadarMetrics(dbj18),
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderColor: '#10b981',
                    borderWidth: 2,
                    pointBackgroundColor: '#10b981'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    angleLines: { color: 'rgba(255, 255, 255, 0.05)' },
                    pointLabels: {
                        color: '#94a3b8',
                        font: { size: 9 }
                    },
                    ticks: {
                        backdropColor: 'transparent',
                        color: '#64748b',
                        font: { size: 8 }
                    },
                    suggestedMin: 0,
                    suggestedMax: 1.5
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        font: { size: 9 }
                    }
                }
            }
        }
    });
}

window.openBomDesignerNew = function() {
    const product = state.activeProduct;
    if (!product) return;

    if (product.status === "立项中" || product.status === "钉钉立项审批中") {
        showToast("当前新品正处于概念立项阶段，配方BOM尚未解锁激活。", "warning");
        return;
    }

    const tbody = document.getElementById("bom-design-items-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const currentBom = product.bom;
    const bomItems = currentBom ? (currentBom.bom_items || []) : [];

    if (bomItems.length === 0 && currentBom) {
        bomItems.push(
            { material_code: "MAT-CU-001", material_name: "高纯铜线", material_spec: "99.99%级", ratio_value: currentBom.copper_wire_ratio, unit: "%" },
            { material_code: "MAT-ACID-001", material_name: "电子级硫酸", material_spec: "98%浓度", ratio_value: currentBom.sulfuric_acid_ratio, unit: "%" },
            { material_code: "AD-GEL-01", material_name: "特种明胶骨胶", material_spec: "生箔添加剂", ratio_value: currentBom.additive_gel, unit: "ppm" },
            { material_code: "AD-HEC-01", material_name: "羟乙基纤维素", material_spec: "生箔添加剂", ratio_value: currentBom.additive_hec, unit: "ppm" },
            { material_code: "AD-SPS-01", material_name: "活性硫整平剂", material_spec: "生箔添加剂", ratio_value: currentBom.additive_s, unit: "ppm" },
            { material_code: "MAT-SILANE-203", material_name: "常规硅烷偶联剂", material_spec: currentBom.silane_type || "常规硅烷-201", ratio_value: currentBom.silane_conc || 0.8, unit: "%" }
        );
    } else if (bomItems.length === 0) {
        bomItems.push(
            { material_code: "MAT-CU-001", material_name: "高纯铜线", material_spec: "99.99%级", ratio_value: 99.8, unit: "%" },
            { material_code: "MAT-ACID-001", material_name: "电子级硫酸", material_spec: "98%浓度", ratio_value: 0.2, unit: "%" }
        );
    }

    bomItems.forEach(item => {
        addBomDesignItem(item.material_code, item.material_name, item.material_spec, item.ratio_value, item.unit);
    });

    const updaterInput = document.getElementById("bom-design-updater");
    if (updaterInput) {
        updaterInput.value = currentBom ? (currentBom.updater || "研发工艺部") : "研发工艺部";
    }

    const pPlan = product.npi_project_plan || {};
    const g2Plan = pPlan.gate2 || {};
    const startInput = document.getElementById("bom-plan-start");
    const endInput = document.getElementById("bom-plan-end");
    const ownerInput = document.getElementById("bom-plan-owner");
    if (startInput) startInput.value = g2Plan.start_date || "";
    if (endInput) endInput.value = g2Plan.plan_end_date || "";
    if (ownerInput) ownerInput.value = g2Plan.owner || "";

    openModal("modal-bom-design-new");
};

window.addBlankBomDesignItem = function() {
    addBomDesignItem("", "", "", "", "%");
};

window.addBomDesignItem = function(code, name, spec, value, unit) {
    const tbody = document.getElementById("bom-design-items-tbody");
    if (!tbody) return;

    const tr = document.createElement("tr");
    tr.className = "design-bom-row";

    tr.innerHTML = `
        <td><input type="text" class="form-control bom-item-code" style="height:28px; padding:2px 6px; font-size:0.75rem;" value="${code}" required placeholder="如 AD-GEL-01"></td>
        <td><input type="text" class="form-control bom-item-name" style="height:28px; padding:2px 6px; font-size:0.75rem;" value="${name}" required placeholder="如 特种明胶骨胶"></td>
        <td><input type="text" class="form-control bom-item-spec" style="height:28px; padding:2px 6px; font-size:0.75rem;" value="${spec}" required placeholder="规格/纯度"></td>
        <td><input type="number" step="any" class="form-control bom-item-value" style="height:28px; padding:2px 6px; font-size:0.75rem;" value="${value}" required placeholder="占比/用量"></td>
        <td><input type="text" class="form-control bom-item-unit" style="height:28px; padding:2px 6px; font-size:0.75rem;" value="${unit}" required placeholder="如 % 或 ppm"></td>
        <td style="text-align: center;">
            <button class="btn-secondary" style="padding:2px 6px; border-color:rgba(239,68,68,0.2); color:var(--color-danger);" onclick="removeBomDesignItem(this)">
                <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
    lucide.createIcons();
};

window.removeBomDesignItem = function(btn) {
    const tr = btn.closest("tr");
    if (tr) {
        tr.remove();
    }
};

window.submitNewBomDesign = function() {
    const product = state.activeProduct;
    if (!product) return;

    const tbody = document.getElementById("bom-design-items-tbody");
    if (!tbody) return;

    const rows = tbody.querySelectorAll(".design-bom-row");
    if (rows.length === 0) {
        showToast("物料清单配比项不能为空，请至少保留一项原辅料。", "error");
        return;
    }

    const items = [];
    let hasError = false;

    rows.forEach(row => {
        const code = row.querySelector(".bom-item-code").value.trim();
        const name = row.querySelector(".bom-item-name").value.trim();
        const spec = row.querySelector(".bom-item-spec").value.trim();
        const valStr = row.querySelector(".bom-item-value").value.trim();
        const unit = row.querySelector(".bom-item-unit").value.trim();

        if (!code || !name || !valStr || !unit) {
            hasError = true;
            return;
        }

        items.push({
            material_code: code,
            material_name: name,
            material_spec: spec,
            ratio_value: parseFloat(valStr) || valStr,
            unit: unit
        });
    });

    if (hasError) {
        showToast("请确保所有新增物料行的物料编码、名称、用量及单位已填写完整。", "error");
        return;
    }

    const updaterInput = document.getElementById("bom-design-updater");
    const updater = updaterInput ? updaterInput.value.trim() : "工艺研发部";

    fetch(`/api/products/${product.id}/save_bom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            items: items,
            updater: updater
        })
    })
    .then(res => res.json())
    .then(data => {
        const start = document.getElementById("bom-plan-start").value;
        const end = document.getElementById("bom-plan-end").value;
        const owner = document.getElementById("bom-plan-owner").value;
        
        saveNpiPlan("gate2", start, end, owner).then(() => {
            showToast("BOM配方与 Gate 2 里程碑排期保存成功！", "success");
            closeModal("modal-bom-design-new");
            loadProductDetails(product.id);
        });
    });
};

window.saveNpiPlan = function(gateKey, start, end, owner) {
    const product = state.activeProduct;
    if (!product) return Promise.resolve();

    return fetch(`/api/products/${product.id}/save_npi_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            gate_key: gateKey,
            start_date: start,
            plan_end_date: end,
            owner: owner,
            updater: "研发工艺部"
        })
    });
};

// ========================================================
// 动态用户库拉取与页首身份渲染
// ========================================================
window.fetchUsers = async function() {
    try {
        const res = await fetch('/api/users');
        const data = await res.json();
        state.users = data;
        
        // 渲染页首身份切换下拉菜单
        const selectEl = document.getElementById("user-role-select");
        if (selectEl) {
            selectEl.innerHTML = "";
            let hasSelectedSaved = false;
            data.forEach(u => {
                if (u.status === '启用') {
                    const opt = document.createElement("option");
                    opt.value = u.username;
                    opt.text = `${u.display_name} (${translateRoleName(u.role)})`;
                    opt.setAttribute("data-role", u.role);
                    opt.setAttribute("data-display-name", u.display_name);
                    opt.style.background = "#1e293b";
                    
                    if (state.currentUsername && u.username === state.currentUsername) {
                        opt.selected = true;
                        state.currentUserRole = u.role;
                        state.currentUserDisplayName = u.display_name;
                        hasSelectedSaved = true;
                    }
                    selectEl.appendChild(opt);
                }
            });
            
            if (!hasSelectedSaved) {
                let foundPeLi = false;
                for (let i = 0; i < selectEl.options.length; i++) {
                    if (selectEl.options[i].value === 'pe_li') {
                        selectEl.selectedIndex = i;
                        const opt = selectEl.options[i];
                        state.currentUsername = opt.value;
                        state.currentUserRole = opt.getAttribute("data-role");
                        state.currentUserDisplayName = opt.getAttribute("data-display-name");
                        foundPeLi = true;
                        break;
                    }
                }
                if (!foundPeLi && selectEl.options.length > 0) {
                    selectEl.selectedIndex = 0;
                    const opt = selectEl.options[0];
                    state.currentUsername = opt.value;
                    state.currentUserRole = opt.getAttribute("data-role");
                    state.currentUserDisplayName = opt.getAttribute("data-display-name");
                }
            }
        }
    } catch (e) {
        console.error("加载用户列表失败:", e);
    }
};

function translateRoleName(role) {
    const names = {
        'Admin': '超级管理员',
        'Product Manager': '产品经理',
        'Process Engineer': '工艺工程师',
        'Quality Engineer': '质量工程师',
        'Viewer': '只读人员'
    };
    return names[role] || role;
}

// ========================================================
// 用户与权限管理控制台业务逻辑
// ========================================================
window.fetchUsersListAndRender = async function() {
    try {
        const res = await fetch('/api/users');
        const data = await res.json();
        state.users = data;
        renderUsersTable(data);
    } catch (e) {
        showToast("拉取用户列表失败，请重试。", "error");
    }
};

function renderUsersTable(users) {
    const tbody = document.querySelector("#plm-users-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">系统无任何注册用户</td></tr>`;
        return;
    }

    users.forEach(u => {
        const tr = document.createElement("tr");
        const isBuiltIn = ["admin", "pm_zhang", "pe_li", "qe_chen", "guest"].includes(u.username);
        
        let editBtn = "";
        let deleteBtn = "";

        if (state.currentUserRole === 'Admin') {
            editBtn = `<button class="btn-secondary" style="padding:2px 8px; font-size:0.72rem; margin-right:4px;" onclick="openUserEditModal(${u.id})">
                            <i data-lucide="edit-3" style="width:11px; height:11px;"></i> 编辑
                       </button>`;
            if (!isBuiltIn) {
                deleteBtn = `<button class="btn-secondary" style="padding:2px 6px; font-size:0.72rem; color:var(--color-danger);" onclick="deleteUser(${u.id})">
                                <i data-lucide="trash-2" style="width:11px; height:11px;"></i>
                             </button>`;
            } else {
                deleteBtn = `<span style="color:var(--text-muted); font-size:0.72rem; margin-left:4px;">演示基石</span>`;
            }
        } else {
            editBtn = `<span style="color:var(--text-muted); font-size:0.72rem;">只读</span>`;
            deleteBtn = `-`;
        }

        const roleNames = {
            'Admin': '管理员',
            'Product Manager': '产品经理',
            'Process Engineer': '工艺工程师',
            'Quality Engineer': '质量工程师',
            'Viewer': '只读访客'
        };
        const statusBadge = u.status === '启用' ? 'badge-green' : 'badge-danger';
        
        tr.innerHTML = `
            <td style="font-family: monospace; font-size: 0.75rem;">${u.username}</td>
            <td style="font-weight: 600;">${u.display_name}</td>
            <td>${roleNames[u.role] || u.role}</td>
            <td><span class="badge ${statusBadge}">${u.status}</span></td>
            <td style="color: var(--text-muted); font-size: 0.75rem;">${formatDate(u.created_at)}</td>
            <td style="text-align:right; white-space:nowrap;">
                ${editBtn}
                ${deleteBtn}
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

window.openUserCreateModal = function() {
    if (!checkPermission(["Admin"], "新增系统用户")) return;
    
    document.getElementById("user-modal-title").innerHTML = `<i data-lucide="user-plus"></i> 新增系统用户`;
    document.getElementById("user-edit-id").value = "";
    document.getElementById("user-username").value = "";
    document.getElementById("user-display-name").value = "";
    document.getElementById("user-role").value = "Process Engineer";
    
    document.getElementById("user-username-group").style.display = "block";
    document.getElementById("user-status-group").style.display = "none";
    
    openModal("modal-user");
    lucide.createIcons();
};

window.openUserEditModal = function(id) {
    if (!checkPermission(["Admin"], "编辑用户信息")) return;
    
    const user = state.users.find(u => u.id === id);
    if (!user) return;
    
    document.getElementById("user-modal-title").innerHTML = `<i data-lucide="edit-3"></i> 编辑系统用户`;
    document.getElementById("user-edit-id").value = user.id;
    document.getElementById("user-username").value = user.username;
    document.getElementById("user-display-name").value = user.display_name;
    document.getElementById("user-role").value = user.role;
    document.getElementById("user-status").value = user.status;
    
    document.getElementById("user-username-group").style.display = "none";
    document.getElementById("user-status-group").style.display = "block";
    
    openModal("modal-user");
    lucide.createIcons();
};

window.submitUserForm = async function() {
    const editId = document.getElementById("user-edit-id").value;
    const username = document.getElementById("user-username").value.trim();
    const displayName = document.getElementById("user-display-name").value.trim();
    const role = document.getElementById("user-role").value;
    const status = document.getElementById("user-status").value;

    if (!displayName) {
        showToast("请输入显示名称", "warning");
        return;
    }

    if (!editId) {
        if (!username) {
            showToast("请输入用户名", "warning");
            return;
        }
        
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: username,
                    display_name: displayName,
                    role: role,
                    status: "启用"
                })
            });
            const data = await res.json();
            
            if (res.ok) {
                showToast(data.message, "success");
                closeModal("modal-user");
                
                await fetchUsers();
                if (state.activeTab === 'users-panel') {
                    fetchUsersListAndRender();
                }
            } else {
                showToast(data.error || "新增用户失败", "error");
            }
        } catch (e) {
            showToast("与服务器通信失败", "error");
        }
    } else {
        try {
            const res = await fetch(`/api/users/${editId}/edit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    display_name: displayName,
                    role: role,
                    status: status
                })
            });
            const data = await res.json();
            
            if (res.ok) {
                showToast(data.message, "success");
                closeModal("modal-user");
                
                await fetchUsers();
                if (state.activeTab === 'users-panel') {
                    fetchUsersListAndRender();
                }
            } else {
                showToast(data.error || "修改用户信息失败", "error");
            }
        } catch (e) {
            showToast("与服务器通信失败", "error");
        }
    }
};

window.deleteUser = async function(id) {
    if (!checkPermission(["Admin"], "删除用户")) return;
    
    const user = state.users.find(u => u.id === id);
    if (!user) return;
    
    if (!confirm(`确认要删除用户「${user.display_name}」吗？`)) {
        return;
    }
    
    try {
        const res = await fetch(`/api/users/${id}/delete`, {
            method: "POST"
        });
        const data = await res.json();
        
        if (res.ok) {
            showToast(data.message, "success");
            await fetchUsers();
            if (state.activeTab === 'users-panel') {
                fetchUsersListAndRender();
            }
        } else {
            showToast(data.error || "删除用户失败", "error");
        }
    } catch (e) {
        showToast("与服务器通信失败", "error");
    }
};

// ======================== 管控模块四：DMS 文管中心 (Document Management System) ========================
const DMS_TEMPLATES_SPEC = {
    // G1
    "NPI_Project_Proposal.pdf": {
        name: "高频铜箔开发立项申请书",
        description: "界定铜箔研发范围、市场应用前景、预计投资收益及项目核心班子。",
        fields: [
            { key: "项目代号", val: "例：HF-PTS-12 (高频高速专用)" },
            { key: "市场背景", val: "随着5G高频与AI算力大爆发，服务器PCB板对极低损耗铜箔提出迫切需求" },
            { key: "开发周期", val: "预计45天（G1-G5）" },
            { key: "投资估算", val: "研发试产预算: 150万元" },
            { key: "项目组", val: "项目经理：张经理；工艺主管：李工；品质主管：陈工" }
        ],
        checklist: ["立项论证意见书", "前沿竞品指标对标单", "中试资源申请表"]
    },
    "Technical_Agreement_TDS.pdf": {
        name: "技术协议规格定义书(TDS)",
        description: "固化目标规格限值，作为研发阶段及终点检验的基准协议标尺。",
        fields: [
            { key: "毛面粗糙度 Rz 限值", val: "目标值 <= 1.20 μm (或依产品类别而定)" },
            { key: "剥离强度下限", val: "目标值 >= 0.75 N/mm" },
            { key: "10GHz Df 传输损耗", val: "目标值 <= 0.0013" },
            { key: "抗拉强度极值", val: "目标值 >= 310 MPa" },
            { key: "延伸率极限", val: "目标值 >= 2.5 %" }
        ],
        checklist: ["技术协议会签单", "产品标称厚度偏差标准", "客户特殊物性规格输入表"]
    },
    "Feasibility_Benchmark.pdf": {
        name: "研发可行性分析及竞品对标报告",
        description: "对标日本三井、圣戈班等国际先进铜箔技术指标，论证量产线改造可行性。",
        fields: [
            { key: "技术可行性", val: "现有4#生箔机及添加剂系统可支撑超薄与超低粗糙度均匀化电解" },
            { key: "对标对象", val: "日本三井 RTF-Type / VLP-Type 高频铜箔" },
            { key: "工艺瓶颈", val: "溶铜电解液中Cl离子及微量添加剂高精度闭环在线滴定" },
            { key: "专利合规", val: "配方不涉及侵权风险，为自主知识产权明胶/骨胶添加物方案" }
        ],
        checklist: ["专利查新检索报告", "关键设备负荷测算表", "物料供应本地化评估单"]
    },
    // G2
    "Formulation_BOM_V1.0.xlsx": {
        name: "首发配方清单(BOM V1.0)",
        description: "确定初始阴极生箔液添加剂与表处化学配比标准表。",
        fields: [
            { key: "高纯铜线配比", val: "占比 99.85%" },
            { key: "电子级硫酸浓度", val: "占比 0.15%" },
            { key: "生箔添加剂 Gel", val: "基准 5.2 ppm (生箔结晶晶向控制)" },
            { key: "生箔添加剂 Hec", val: "基准 3.5 ppm" },
            { key: "生箔添加剂 S", val: "基准 8.0 ppm" },
            { key: "硅烷偶联剂类型", val: "常规硅烷-201 / 浓度基准 0.8%" }
        ],
        checklist: ["配方安全性评估单", "供应商化学品安全规范MSDS", "新物料准入品质控制卡"]
    },
    "Electrolyte_Chemistry_Spec.pdf": {
        name: "电解液组分化学检测规范",
        description: "为溅镀工段及循环槽液的铜酸浓度、杂质微量分析确立滴定标准。",
        fields: [
            { key: "Cu离子浓度控制", val: "标准范围：80 ~ 85 g/L" },
            { key: "H2SO4硫酸浓度控制", val: "标准范围：110 ~ 120 g/L" },
            { key: "Cl氯离子电解液限值", val: "标准范围：30 ~ 35 ppm" },
            { key: "Fe/Pb微量金属杂质", val: "最大允许限值：Fe <= 50 ppm, Pb <= 5 ppm" }
        ],
        checklist: ["电解液分析仪器校准记录", "槽液定时滴定取样路线图", "异常槽液调整备忘录"]
    },
    "Grain_SEM_Analysis.pdf": {
        name: "铜箔金相微观晶粒分析报告",
        description: "通过扫描电镜 (SEM) 观测生箔结晶微观结构，确保晶粒均匀微细且无粗大结晶。",
        fields: [
            { key: "观测倍率", val: "SEM 2000x / 5000x 金相显微" },
            { key: "毛面微观形貌", val: "呈均匀圆锥状微米颗粒，无长条柱状晶或撕裂坑" },
            { key: "截面晶粒度", val: "平均晶粒直径 <= 1.5 μm" },
            { key: "结晶取向指数", val: "XRD (220)/(111) 面衍射晶向特定强度比" }
        ],
        checklist: ["扫描电镜SEM观测原片", "晶粒度标定数据表", "粗晶预防控制卡"]
    },
    // G3
    "DVT_Routing_Card.xlsx": {
        name: "中试工艺路线图与参数卡",
        description: "固化中试试产的工段设备编号及标准运行参数阈值范围。",
        fields: [
            { key: "溶铜运行参数", val: "槽液温度 80±2 ℃，流量 450±10 L/min" },
            { key: "生箔运行参数", val: "电流密度 65±2 A/dm²，机台电压 6.8±0.1 V" },
            { key: "表处运行参数", val: "极板电流 1800±50 A，干燥温度 130±5 ℃" },
            { key: "分切运行参数", val: "收卷张力 220±10 N，分切速度 150±5 m/min" }
        ],
        checklist: ["工艺规程签审单", "设备点检指导卡", "中试防错(Poka-yoke)核对清单"]
    },
    "Drum_Deviation_Study.pdf": {
        name: "生箔阴极辊工艺偏离分析报告",
        description: "测试阴极辊运行温差波动及电流密度分布对铜箔厚度及粗糙度极差的影响。",
        fields: [
            { key: "测试设备", val: "2#生箔机阴极钛辊" },
            { key: "温度极差测试", val: "阴极辊左-中-right三点表面温差 <= 0.8 ℃" },
            { key: "偏离拉偏极值", val: "在电流密度拉偏5%时，分析结晶均匀度和粗糙度Rz极差波动" },
            { key: "结论预防", val: "当辊面局部温差达1.5℃时，Rz极差将增加0.15μm，需开启辊温水冷闭环" }
        ],
        checklist: ["辊面红外成像测温记录", "厚度极差波动雷达图", "极板距平行度偏差记录"]
    },
    "DVT_Trial_Physical_Report.pdf": {
        name: "中试首批次物性测试报告",
        description: "中试出卷的首卷铜箔样品理化检验结果，作为进Gate 4验证的实测依据。",
        fields: [
            { key: "样品编号", val: "DVT-Trial-02052-S01" },
            { key: "厚度均匀性", val: "标称 12μm / 实测极差 0.25 μm" },
            { key: "抗拉强度", val: "实测 318 MPa (合格)" },
            { key: "表面防氧化钝化度", val: "高温250℃烘烤30min，表面不发生局部烘焦变色或斑点" }
        ],
        checklist: ["实验室物性化验单原件", "烘烤氧化测试照片", "高频网分阻抗扫描图谱"]
    },
    // G4
    "PVT_Mass_Validation.pdf": {
        name: "量产机台稳定性负荷评估报告",
        description: "评估产品在量产大生产线（如大容量溶铜、宽幅表处）中各主辅设备运行可靠性。",
        fields: [
            { key: "评估时长", val: "量产大线连续试产 72 小时" },
            { key: "设备负荷率", val: "主整流柜运转负荷：85%，电极钛辊温升恒定度符合要求" },
            { key: "辅助循环系统", val: "表处液高频循环自清洗过滤器压差波动 <= 0.05 MPa" },
            { key: "评估结论", val: "设备硬件负荷充裕，量产线连续大卷重产出无瓶颈" }
        ],
        checklist: ["设备连续运行点检表", "能源介质消耗分析表", "机台异常报警统计报告"]
    },
    "Process_Cpk_Report.xlsx": {
        name: "生箔工艺Cpk波动分析看板",
        description: "统计 30 批次以上主要物性（厚度、粗糙度极差）指标的 Cpk 过程控制能力系数。",
        fields: [
            { key: "厚度均值控制 Cpk", val: "Cpk = 1.48 (过程控制能力优秀)" },
            { key: "毛面粗糙度 Rz Cpk", val: "Cpk = 1.38 (标准要求 >=1.33)" },
            { key: "控制图表类型", val: "Xbar-S 均值标准差控制图" },
            { key: "样本容量", val: "连续收集 50 批中试试产数据" }
        ],
        checklist: ["Cpk 数据原始计算表格", "异常波动点排查追踪表", "量产线控制上下限设定表"]
    },
    "Type_Test_Reliability_Report.pdf": {
        name: "型式试验及可靠性测试报告",
        description: "产品模拟客户端的高温层压、多层板压合、耐酸碱蚀刻、长期高温高湿剥离强度衰减可靠性分析。",
        fields: [
            { key: "高温高湿测试", val: "双85（85℃/85% RH）环境下连续试验 240 小时" },
            { key: "剥离强度衰减率", val: "试验后剥离强度从 0.82 降至 0.78 N/mm (衰减仅4.8%)" },
            { key: "耐焊性测试", val: "288℃极速浸焊 10秒 x 3次，无任何起泡或分层缺陷" }
        ],
        checklist: ["环境试验设备监控曲线", "金相切片剥离断口显微照", "耐蚀刻特性评定合格证"]
    },
    // G5
    "PPAP_PSW_Signoff.pdf": {
        name: "生产件批准程序保证书(PPAP PSW)",
        description: "汽车及高端服务器供应链通用的零部件提交承认批准保证书（Part Submission Warrant），宣告承认通过。",
        fields: [
            { key: "客户承认批复", val: "PPAP 提交等级：Level 3 承认通过" },
            { key: "物料代码/图号", val: "HF-PTS-12-MP" },
            { key: "PSW 签署代表", val: "质控部主管 钱品质 / 研发总监 傅青炫" },
            { key: "零件尺寸规格一致性", val: "超薄铜箔厚度全点位均匀度达标，尺寸全检合格" }
        ],
        checklist: ["材料申报IMDS证书", "外观合格认可签署表(AAR)", "包装运输振动试验报告"]
    },
    "Mass_Control_Plan.pdf": {
        name: "量产控制计划书(Control Plan)",
        description: "从原材料、溶铜、生箔、防氧化、分切到包装，规定每一个控制节点的检测频次、量具及处置规范。",
        fields: [
            { key: "控制点：高纯铜", val: "检测项：微量元素杂质 / 频次：每批 / 量具：电感耦合等离子光谱仪(ICP)" },
            { key: "控制点：电解生箔", val: "检测项：厚度及Rz粗糙度 / 频次：在线测厚+每卷首尾样 / 量具：高精度千分尺" },
            { key: "控制点：分切外观", val: "检测项：表面氧化、划伤 / 频次：100%全长检测 / 仪器：高频在线缺陷CCD扫描仪" }
        ],
        checklist: ["控制计划发布审签单", "现场操控制造记录卡模板", "异常处理流程与SOP卡"]
    },
    "PFMEA_Copper_Foil_Line.xlsx": {
        name: "失效模式分析报告(PFMEA)",
        description: "识别量产阶段可能出现的工艺缺陷（如厚度不均、电镀漏铜、表面氧化），评定风险顺序数 RPN 并制定纠正预防措施。",
        fields: [
            { key: "失效模式：表面抗氧化失效", val: "RPN估算：严重度(S)=7, 频度(O)=3, 探测度(D)=4, RPN = 84" },
            { key: "防范措施：抗氧化", val: "定期检测表处胶辊接触，防止烘箱漏温，并提升防氧化膜的涂覆均匀性" },
            { key: "失效模式：生箔辊面粘铜起泡", val: "RPN估算：严重度(S)=8, 频度(O)=2, 探测度(D)=3, RPN = 48" },
            { key: "纠正防范措施", val: "使用高密度气囊刷定期辊面抛光，同时设定电解液固形杂质过滤等级" }
        ],
        checklist: ["PFMEA 风险评审会议纪要", "RPN 阈值改进触发细则", "历史工程防错经验数据库(Lesson Learnt)"]
    }
};

window.renderDmsPanel = function() {
    const listContainer = document.getElementById("dms-products-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    const categoryFilter = document.getElementById("dms-category-filter").value;
    const filteredProducts = state.products.filter(p => !categoryFilter || p.category === categoryFilter);

    if (filteredProducts.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.8rem;">未匹配到产品型号</div>`;
        document.getElementById("dms-stages-container").innerHTML = "";
        document.getElementById("dms-selected-product-title").innerText = "暂无选中产品";
        document.getElementById("dms-selected-product-meta").innerText = "请添加产品型号以进行文档交付物管理。";
        return;
    }

    // 默认选中第一个
    if (!state.dmsActiveProductId || !filteredProducts.find(p => p.id === state.dmsActiveProductId)) {
        state.dmsActiveProductId = filteredProducts[0].id;
    }

    // 渲染左侧产品卡片列表
    filteredProducts.forEach(p => {
        const item = document.createElement("div");
        const isActive = p.id === state.dmsActiveProductId;
        item.className = `sidebar-prod-item ${isActive ? 'active' : ''}`;
        item.style.padding = "10px 12px";
        item.style.cursor = "pointer";
        item.style.borderRadius = "6px";
        item.style.border = isActive ? "1px solid var(--color-primary)" : "1px solid rgba(255,255,255,0.02)";
        item.style.background = isActive ? "rgba(59, 130, 246, 0.1)" : "rgba(30, 41, 59, 0.2)";
        item.style.transition = "var(--transition-smooth)";

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="font-size: 0.82rem; color: ${isActive ? 'var(--color-primary)' : 'var(--text-primary)'};">${p.code}</strong>
                <span class="badge ${p.status === '量产中' ? 'badge-green' : 'badge-blue'}" style="font-size: 0.65rem;">${p.status}</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${p.name}</div>
        `;

        item.onclick = () => {
            state.dmsActiveProductId = p.id;
            renderDmsPanel();
        };

        listContainer.appendChild(item);
    });

    // 渲染右侧选中的产品详情和 5 大阶段文档卡片
    const selectedProd = state.products.find(p => p.id === state.dmsActiveProductId);
    if (!selectedProd) return;

    document.getElementById("dms-selected-product-title").innerHTML = `<i data-lucide="folder-git"></i> ${selectedProd.name} (${selectedProd.code}) &middot; NPI 开发交付物`;
    document.getElementById("dms-selected-product-meta").innerText = `所属分类：${selectedProd.category} | 创建人：${selectedProd.creator} | 当前开发节点：${selectedProd.status}。以下展示该型号各门禁阶段的专业交付文件清单与规范模版。`;

    const workflow = selectedProd.npi_workflow;
    const stagesContainer = document.getElementById("dms-stages-container");
    stagesContainer.innerHTML = "";

    const deliverablesConfig = {
        gate1: {
            title: "G1. 立项与目标",
            badge: "立项阶段",
            files: [
                { name: "高频铜箔开发申请书", code: "NPI_Project_Proposal.pdf" },
                { name: "技术协议规格定义书(TDS)", code: "Technical_Agreement_TDS.pdf" },
                { name: "研发可行性分析对标报告", code: "Feasibility_Benchmark.pdf" }
            ]
        },
        gate2: {
            title: "G2. 配方定型 (EVT)",
            badge: "设计定型",
            files: [
                { name: "首发配方清单(BOM V1.0)", code: "Formulation_BOM_V1.0.xlsx" },
                { name: "电解液组分化学检测规范", code: "Electrolyte_Chemistry_Spec.pdf" },
                { name: "铜箔金相微观晶粒分析报告", code: "Grain_SEM_Analysis.pdf" }
            ]
        },
        gate3: {
            title: "G3. 工艺与中试 (DVT)",
            badge: "中试工艺",
            files: [
                { name: "中试工艺路线图与参数卡", code: "DVT_Routing_Card.xlsx" },
                { name: "生箔阴极辊工艺偏离报告", code: "Drum_Deviation_Study.pdf" },
                { name: "中试首批次物性测试报告", code: "DVT_Trial_Physical_Report.pdf" }
            ]
        },
        gate4: {
            title: "G4. 生产验证 (PVT)",
            badge: "量产验证",
            files: [
                { name: "量产机台稳定性负荷评估", code: "PVT_Mass_Validation.pdf" },
                { name: "生箔工艺Cpk波动分析看板", code: "Process_Cpk_Report.xlsx" },
                { name: "型式试验及可靠性测试报告", code: "Type_Test_Reliability_Report.pdf" }
            ]
        },
        gate5: {
            title: "G5. PPAP 与量产 (MP)",
            badge: "封档量产",
            files: [
                { name: "生产件批准程序保证书(PPAP)", code: "PPAP_PSW_Signoff.pdf" },
                { name: "量产控制计划书(Control Plan)", code: "Mass_Control_Plan.pdf" },
                { name: "失效模式分析报告(PFMEA)", code: "PFMEA_Copper_Foil_Line.xlsx" }
            ]
        }
    };

    const keys = ["gate1", "gate2", "gate3", "gate4", "gate5"];

    keys.forEach(k => {
        const gateData = workflow ? workflow[k] : { status: "LOCKED" };
        const config = deliverablesConfig[k];
        if (!config) return;

        const stageCard = document.createElement("div");
        stageCard.className = "glass-panel";
        stageCard.style.padding = "16px";
        stageCard.style.display = "flex";
        stageCard.style.flexDirection = "column";
        stageCard.style.gap = "12px";

        // 高亮当前进行中和已完成的阶段
        if (gateData.status === "COMPLETED") {
            stageCard.style.borderLeft = "4px solid var(--color-success)";
        } else if (gateData.status === "RUNNING" || gateData.status === "APPROVING") {
            stageCard.style.borderLeft = "4px solid var(--color-primary)";
            stageCard.style.background = "rgba(59, 130, 246, 0.01)";
        } else {
            stageCard.style.borderLeft = "4px solid var(--text-muted)";
            stageCard.style.opacity = "0.7";
        }

        // 状态徽章
        let statusBadge = "";
        let isLocked = false;
        if (gateData.status === "COMPLETED") {
            statusBadge = `<span class="badge badge-green">已归档 &amp; 通过</span>`;
        } else if (gateData.status === "RUNNING") {
            statusBadge = `<span class="badge badge-blue">正在进行 / 编写中</span>`;
        } else if (gateData.status === "APPROVING") {
            statusBadge = `<span class="badge badge-warning">钉钉评审中</span>`;
        } else if (gateData.status === "FAILED") {
            statusBadge = `<span class="badge badge-danger">驳回待修改</span>`;
        } else {
            statusBadge = `<span class="badge badge-gray">未开启 (锁住)</span>`;
            isLocked = true;
        }

        // 生成文件清单 HTML
        let filesHtml = "";
        config.files.forEach(f => {
            const isExcel = f.code.endsWith(".xlsx");
            const fileIcon = isExcel ? "file-spreadsheet" : "file-text";
            const iconColor = isLocked ? "var(--text-muted)" : (gateData.status === "COMPLETED" ? "var(--color-success)" : "var(--color-primary)");

            let actionButtonsHtml = "";
            if (isLocked) {
                actionButtonsHtml = `<span style="font-size:0.7rem; color:var(--text-muted); font-style:italic;"><i data-lucide="lock" style="width:11px; height:11px; display:inline-block; vertical-align:middle; margin-right:2px;"></i>阶段未开启，暂锁</span>`;
            } else {
                actionButtonsHtml = `
                    <div style="display:flex; gap:8px;">
                        <button class="btn-secondary" style="padding:3px 8px; font-size:0.68rem; display:flex; align-items:center; gap:3px;" onclick="previewDmsTemplate('${f.code}', '${f.name}')">
                            <i data-lucide="eye" style="width:12px; height:12px;"></i> 在线预览
                        </button>
                        <button class="btn-primary" style="padding:3px 8px; font-size:0.68rem; display:flex; align-items:center; gap:3px;" onclick="downloadDmsTemplate('${f.code}', '${f.name}')">
                            <i data-lucide="download" style="width:12px; height:12px;"></i> 下载模版
                        </button>
                        <button class="btn-secondary" style="padding:3px 8px; font-size:0.68rem; border-color:rgba(16,185,129,0.3); color:var(--color-success); display:flex; align-items:center; gap:3px;" onclick="showToast('正在上传并覆盖归档: ${f.code}', 'success')">
                            <i data-lucide="upload-cloud" style="width:12px; height:12px;"></i> 上传归档
                        </button>
                    </div>
                `;
            }

            filesHtml += `
                <div style="display:grid; grid-template-columns: 2fr 1.5fr; gap:16px; align-items:center; background:rgba(30,41,59,0.25); border:1px solid rgba(255,255,255,0.02); border-radius:6px; padding:10px 14px;">
                    <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                        <i data-lucide="${fileIcon}" style="width:16px; height:16px; color:${iconColor}; flex-shrink:0;"></i>
                        <div style="overflow:hidden;">
                            <div style="font-size:0.8rem; font-weight:500; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${f.name}">${f.name}</div>
                            <div style="font-size:0.68rem; color:var(--text-muted); font-family:monospace; margin-top:2px;">${f.code}</div>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:flex-end;">
                        ${actionButtonsHtml}
                    </div>
                </div>
            `;
        });

        stageCard.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:0.75rem; font-weight:bold; color:var(--color-primary); background:rgba(59,130,246,0.1); padding:2px 6px; border-radius:4px;">${config.badge}</span>
                    <h3 style="font-size:0.9rem; font-weight:bold; margin:0; color:var(--text-primary);">${config.title}</h3>
                </div>
                ${statusBadge}
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${filesHtml}
            </div>
        `;

        stagesContainer.appendChild(stageCard);
    });

    lucide.createIcons({
        attrs: {
            "stroke-width": 2
        },
        nameAttr: "data-lucide",
        node: stagesContainer
    });
};

window.downloadDmsTemplate = function(fileCode, fileName) {
    const selectedProd = state.products.find(p => p.id === state.dmsActiveProductId) || {};
    
    // 判定是否有 TDS 和 BOM
    const hasActiveTds = fileCode === "Technical_Agreement_TDS.pdf" && selectedProd.tds && selectedProd.tds.tds_items && selectedProd.tds.tds_items.length > 0;
    const hasActiveBom = fileCode === "Formulation_BOM_V1.0.xlsx" && selectedProd.bom && selectedProd.bom.bom_items && selectedProd.bom.bom_items.length > 0;
    
    let displayFileName = fileName;
    if (hasActiveTds) {
        displayFileName = `Technical_Agreement_TDS_${selectedProd.tds.tds_version}.csv`;
    } else if (hasActiveBom) {
        displayFileName = `Formulation_BOM_${selectedProd.bom.version}.csv`;
    } else {
        displayFileName = `${fileCode.split('.')[0]}_模版_CP.csv`;
    }
    
    showToast(`已成功启动受控归档文档下载：${displayFileName}`, "success");
    
    const spec = DMS_TEMPLATES_SPEC[fileCode];
    if (!spec) return;

    let csvContent = "\uFEFF"; // BOM
    csvContent += `文档受控名称,${hasActiveTds ? ('技术协议规格书_' + selectedProd.tds.tds_version) : (hasActiveBom ? ('配方单BOM_' + selectedProd.bom.version) : spec.name)}\n`;
    csvContent += `物理文档编码,${fileCode}\n`;
    csvContent += `管理密级,机密 (NPI受控)\n`;
    csvContent += `归档说明,${spec.description}\n\n`;
    
    if (hasActiveTds) {
        csvContent += "序号,检验项目,技术规格限值,检测标准方法\n";
        selectedProd.tds.tds_items.forEach((item, idx) => {
            const num = item.item_no !== undefined ? item.item_no : (idx + 1);
            const fullName = `${item.name_zh || ''}${item.name_en ? ' / ' + item.name_en : ''}`;
            const limit = `${item.spec || ''} ${item.unit || ''}`;
            const method = item.test_standard || '内控标准';
            csvContent += `"${num}","${fullName}","${limit}","${method}"\n`;
        });
    } else if (hasActiveBom) {
        csvContent += "序号,原料配方代码,物料中文名称及规格说明,投料配比值\n";
        selectedProd.bom.bom_items.forEach((item, idx) => {
            const num = idx + 1;
            const matCode = item.material_code || `MAT-ADD-${num}`;
            const matName = `${item.material_name || ''}${item.material_spec ? ' / ' + item.material_spec : ''}`;
            const ratio = `${item.ratio_value || '0'} ${item.unit || '%'}`;
            csvContent += `"${num}","${matCode}","${matName}","${ratio}"\n`;
        });
    } else {
        csvContent += "项目节点,参数标准/技术规格\n";
        spec.fields.forEach(f => {
            csvContent += `"${f.key}","${f.val}"\n`;
        });
    }
    
    csvContent += "\n审计确认项\n";
    spec.checklist.forEach(c => {
        csvContent += `"${c}","[x] 已由审计委员会签署通过"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", displayFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.previewDmsTemplate = function(fileCode, fileName) {
    const spec = DMS_TEMPLATES_SPEC[fileCode];
    if (!spec) {
        showToast("该文件规格尚未配置模版预览数据", "warning");
        return;
    }

    const selectedProd = state.products.find(p => p.id === state.dmsActiveProductId) || { code: "HF-PTS-12", name: "高频铜箔开发申请" };

    // 判定是否有正式发布的活动 TDS 规格
    const hasActiveTds = fileCode === "Technical_Agreement_TDS.pdf" && selectedProd.tds && selectedProd.tds.tds_items && selectedProd.tds.tds_items.length > 0;
    const activeTdsVersion = hasActiveTds ? selectedProd.tds.tds_version : null;

    // 判定是否有正式定型的活动 BOM 配方
    const hasActiveBom = fileCode === "Formulation_BOM_V1.0.xlsx" && selectedProd.bom && selectedProd.bom.bom_items && selectedProd.bom.bom_items.length > 0;
    const activeBomVersion = hasActiveBom ? selectedProd.bom.version : null;

    // 动态计算文件名
    let finalFileName = fileName;
    if (activeTdsVersion) {
        finalFileName = `Technical_Agreement_TDS_${activeTdsVersion}.pdf`;
    } else if (activeBomVersion) {
        finalFileName = `Formulation_BOM_${activeBomVersion}.pdf`;
    }

    // 设置 PDF 标题
    document.getElementById("dms-pdf-title").innerText = `${finalFileName} - NPI研发受控归档文档`;

    // 动态生成正文表格 Header 与 Rows
    let tableHeaderHtml = "";
    let fieldsHtml = "";
    
    if (hasActiveTds) {
        tableHeaderHtml = `
            <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0; text-align:center; width:45px;">序号</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">检验项目 (ZH / EN)</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0; text-align:center; width:120px;">技术规格限值</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569;">检测标准方法</th>
            </tr>
        `;
        selectedProd.tds.tds_items.forEach((item, idx) => {
            const num = item.item_no !== undefined ? item.item_no : (idx + 1);
            const fullName = `${item.name_zh || ''}${item.name_en ? ' (' + item.name_en + ')' : ''}`;
            const limit = `${item.spec || ''} ${item.unit || ''}`;
            const method = item.test_standard || '内控企业标准';
            
            fieldsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; font-size: 0.72rem; border-right: 1px solid #e2e8f0; text-align:center; color:#64748b;">${num}</td>
                    <td style="padding: 8px 10px; font-weight: 600; color: #334155; font-size: 0.72rem; border-right: 1px solid #e2e8f0;">${fullName}</td>
                    <td style="padding: 8px 10px; color: #b91c1c; font-weight: 700; font-size: 0.72rem; border-right: 1px solid #e2e8f0; text-align:center; background:#fff5f5;">${limit}</td>
                    <td style="padding: 8px 10px; color: #475569; font-size: 0.72rem;">${method}</td>
                </tr>
            `;
        });
    } else if (hasActiveBom) {
        tableHeaderHtml = `
            <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0; text-align:center; width:45px;">序号</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">原料配方代码</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">物料中文名称及规格</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; text-align:center; width:120px;">投料配比值</th>
            </tr>
        `;
        selectedProd.bom.bom_items.forEach((item, idx) => {
            const num = idx + 1;
            const matCode = item.material_code || `MAT-ADD-${num}`;
            const matName = `${item.material_name || ''}${item.material_spec ? ' (' + item.material_spec + ')' : ''}`;
            const ratio = `${item.ratio_value || '0'} ${item.unit || '%'}`;
            
            fieldsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; font-size: 0.72rem; border-right: 1px solid #e2e8f0; text-align:center; color:#64748b;">${num}</td>
                    <td style="padding: 8px 10px; font-size: 0.72rem; border-right: 1px solid #e2e8f0; font-family:monospace;">${matCode}</td>
                    <td style="padding: 8px 10px; font-weight: 600; color: #334155; font-size: 0.72rem; border-right: 1px solid #e2e8f0;">${matName}</td>
                    <td style="padding: 8px 10px; color: #15803d; font-weight: 700; font-size: 0.72rem; text-align:center; background:#f0fdf4;">${ratio}</td>
                </tr>
            `;
        });
    } else {
        tableHeaderHtml = `
            <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 8px 12px; font-size: 0.74rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">规范模板字段</th>
                <th style="padding: 8px 12px; font-size: 0.74rem; font-weight: bold; color: #475569;">标准取值与填报要求</th>
            </tr>
        `;
        spec.fields.forEach(f => {
            fieldsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 10px 12px; font-weight: 600; color: #334155; font-size: 0.76rem; width: 160px; background: #f8fafc; border-right: 1px solid #e2e8f0;">${f.key}</td>
                    <td style="padding: 10px 12px; color: #1e293b; font-size: 0.76rem;">${f.val}</td>
                </tr>
            `;
        });
    }

    // 动态生成合规核对单
    let checklistHtml = "";
    spec.checklist.forEach(c => {
        checklistHtml += `
            <li style="display: flex; align-items: center; gap: 8px; font-size: 0.74rem; color: #475569; padding: 2px 0;">
                <i data-lucide="check-square" style="width: 13px; height: 13px; color: #10b981; flex-shrink:0;"></i>
                <span>${c}</span>
            </li>
        `;
    });

    // 水印与红色印章样式
    const stampSvg = `
        <div style="position: absolute; top: 40px; right: 40px; z-index: 15; transform: rotate(-8deg); pointer-events: none; opacity: 0.85;">
            <svg width="105" height="105" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#ef4444" stroke-width="2.2" />
                <circle cx="60" cy="60" r="49" fill="none" stroke="#ef4444" stroke-width="0.8" />
                <polygon points="60,37 63,47 73,47 65,53 68,63 60,57 52,63 55,53 47,47 57,47" fill="#ef4444" />
                <path id="circlePath" d="M 18,60 A 42,42 0 0,1 102,60" fill="none" stroke="none" />
                <text fill="#ef4444" font-size="8.2" font-weight="bold" letter-spacing="1">
                    <textPath href="#circlePath" startOffset="50%" text-anchor="middle">
                        GHZ 高频铜箔研发中心
                    </textPath>
                </text>
                <path id="circlePathBottom" d="M 102,60 A 42,42 0 0,1 18,60" fill="none" stroke="none" />
                <text fill="#ef4444" font-size="8.8" font-weight="bold" letter-spacing="1.2">
                    <textPath href="#circlePathBottom" startOffset="50%" text-anchor="middle">
                        NPI 受控文件专用章
                    </textPath>
                </text>
            </svg>
        </div>
    `;

    const canvas = document.getElementById("dms-pdf-canvas");
    if (!canvas) return;
    canvas.innerHTML = "";

    // 创建 A4 容器
    const a4Page = document.createElement("div");
    a4Page.style.width = "100%";
    a4Page.style.maxWidth = "660px";
    a4Page.style.minHeight = "800px";
    a4Page.style.background = "#ffffff";
    a4Page.style.color = "#0f172a";
    a4Page.style.padding = "40px";
    a4Page.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.4)";
    a4Page.style.margin = "0 auto";
    a4Page.style.position = "relative";
    a4Page.style.overflow = "hidden";
    a4Page.style.borderRadius = "4px";

    // 创建斜平铺受控水印
    const watermark = document.createElement("div");
    watermark.style.position = "absolute";
    watermark.style.top = "0";
    watermark.style.left = "0";
    watermark.style.width = "100%";
    watermark.style.height = "100%";
    watermark.style.pointerEvents = "none";
    watermark.style.zIndex = "10";
    watermark.style.opacity = "0.04";
    watermark.style.backgroundImage = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><text x='30' y='100' font-size='12' font-weight='bold' fill='%23000000' transform='rotate(-30 100 100)'>NPI CONTROLLED</text><text x='45' y='120' font-size='10' fill='%23000000' transform='rotate(-30 100 100)'>受控文件 严禁复制</text></svg>")`;

    a4Page.appendChild(watermark);

    // 将印章及受控正文渲染进 A4 纸张
    const containerDiv = document.createElement("div");
    containerDiv.style.position = "relative";
    containerDiv.style.zIndex = "12";
    // 动态拼接版本
    let versionLabel = "V1.0.0 受控版";
    if (activeTdsVersion) {
        versionLabel = `${activeTdsVersion} 正式发布版`;
    } else if (activeBomVersion) {
        versionLabel = `${activeBomVersion} 受控定型版`;
    }
    const parameterTitle = (activeTdsVersion || activeBomVersion) ? "二、 核心规范指标与参数数据" : "二、 核心规范指标与参数样表";

    containerDiv.innerHTML = `
        ${stampSvg}
        
        <!-- 文件头部 -->
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
            <div style="font-size: 0.65rem; color: #475569; font-weight: bold; letter-spacing: 1px; margin-bottom: 4px;">GHZ COPPER FOIL CO., LTD. &middot; NPI SYSTEM</div>
            <h1 style="font-size: 1.35rem; font-weight: 800; color: #0f172a; margin: 0;">研发交付物规范与受控技术文档</h1>
            <div style="font-size: 0.72rem; color: #64748b; margin-top: 4px; font-family: monospace;">文档物理编码：${fileCode}</div>
        </div>

        <!-- 元信息受控表 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 20px; font-size: 0.74rem;">
            <div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">对应产品：</strong><span style="color: #0f172a; font-weight:600;">${selectedProd.name} (${selectedProd.code})</span></div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">处理配方：</strong><span style="color: #1e3a8a; font-weight:600;">${selectedProd.surface_treatment || 'STD常规'}</span></div>
                <div><strong style="color: #475569;">管理密级：</strong><span style="color: #ef4444; font-weight:600;">机密 (NPI CONTROLLED)</span></div>
            </div>
            <div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">编制部门：</strong><span style="color: #0f172a;">高频铜箔研发中心</span></div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">版本信息：</strong><span style="color: #0f172a; font-family: monospace;">${versionLabel}</span></div>
                <div><strong style="color: #475569;">当前日期：</strong><span style="color: #0f172a; font-family: monospace;">2026年7月8日</span></div>
            </div>
        </div>

        <!-- 说明区 -->
        <div style="margin-bottom: 20px;">
            <h3 style="font-size: 0.82rem; font-weight: bold; color: #0f172a; margin: 0 0 6px 0;">一、 文档目的与大纲说明</h3>
            <p style="font-size: 0.74rem; line-height: 1.5; color: #334155; margin: 0; text-indent: 20px;">${spec.description}</p>
        </div>

        <!-- 技术参数与表格正文 -->
        <div style="margin-bottom: 20px;">
            <h3 style="font-size: 0.82rem; font-weight: bold; color: #0f172a; margin: 0 0 8px 0;">${parameterTitle}</h3>
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #ffffff;">
                <table style="width: 100%; border-collapse: collapse; border: none; text-align: left;">
                    <thead>
                        ${tableHeaderHtml}
                    </thead>
                    <tbody>
                        ${fieldsHtml}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 签署审计Checklist -->
        <div style="background: #ecfdf5; border: 1px dashed #a7f3d0; border-radius: 6px; padding: 14px; margin-bottom: 24px;">
            <h4 style="font-size: 0.76rem; font-weight: bold; color: #065f46; margin: 0 0 8px 0; display: flex; align-items: center; gap: 4px;">
                <i data-lucide="shield-check" style="width:14px; height:14px;"></i> 合规性审计核对单 (Checklist)
            </h4>
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px;">
                ${checklistHtml}
            </ul>
        </div>

        <!-- 签署栏 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; font-size: 0.7rem; border-top: 1px dashed #cbd5e1; padding-top: 16px; color: #475569;">
            <div>
                <strong>起草人签署：</strong>
                <div style="font-style: italic; font-weight: bold; font-family: Georgia, serif; font-size: 1.1rem; color: #1e3a8a; height: 28px; line-height: 28px; padding-left: 10px;">
                    ${selectedProd.creator || "张经理"}
                </div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">研发项目经理</div>
            </div>
            <div>
                <strong>校对人签署：</strong>
                <div style="font-style: italic; font-weight: bold; font-family: Georgia, serif; font-size: 1.1rem; color: #1e3a8a; height: 28px; line-height: 28px; padding-left: 10px;">
                    李建国
                </div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">工艺高级专家</div>
            </div>
            <div>
                <strong>批准人签署：</strong>
                <div style="font-style: italic; font-weight: bold; font-family: Georgia, serif; font-size: 1.1rem; color: #1e3a8a; height: 28px; line-height: 28px; padding-left: 10px;">
                    傅青炫
                </div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">研发总监</div>
            </div>
        </div>
    `;
    a4Page.appendChild(containerDiv);
    canvas.appendChild(a4Page);

    // 绑定顶部下载按钮
    document.getElementById("btn-dms-pdf-download").onclick = () => {
        closeModal("modal-dms-template-preview");
        downloadDmsTemplate(fileCode, finalFileName);
    };

    openModal("modal-dms-template-preview");

    lucide.createIcons({
        attrs: {
            "stroke-width": 2
        },
        nameAttr: "data-lucide",
        node: canvas
    });
};

// 渲染智能预警与协同待办时间轴
function renderAlertsTimeline(products, logs) {
    const timelineEl = document.getElementById("dashboard-alerts-timeline");
    if (!timelineEl) return;
    timelineEl.innerHTML = "";

    const alerts = [];

    // 1. 提取进行中的钉钉审批流 (协同待办)
    if (logs && logs.length > 0) {
        logs.slice(0, 5).forEach(log => {
            if (log.status === "RUNNING") {
                let desc = "";
                if (log.related_type === "PRODUCT") {
                    desc = `产品立项审批：${log.content.name} (${log.content.code})`;
                } else {
                    desc = `工艺变更审批：${log.content.ecn_no} - ${log.content.change_reason}`;
                }
                alerts.push({
                    type: "info",
                    title: "【钉钉协同】待您审批",
                    desc: desc,
                    time: log.created_at,
                    icon: "clock"
                });
            }
        });
    }

    // 2. 扫描在研产品的门禁节点排期超期 (门禁预警)
    if (products && products.length > 0) {
        const now = new Date();
        products.forEach(p => {
            let plan = p.npi_project_plan;
            if (typeof plan === "string" && plan) {
                try { plan = JSON.parse(plan); } catch(e) { plan = null; }
            }
            if (p.status !== "量产中" && p.status !== "废弃" && plan) {
                // 获取当前状态对应的门禁阶段
                let curGateKey = null;
                if (p.status === "立项中" || p.status === "钉钉立项审批中") curGateKey = "gate1";
                else if (p.status === "溶铜造液中" || p.status === "溅镀开发中") curGateKey = "gate2";
                else if (p.status === "生箔电镀中" || p.status === "表面处理中" || p.status === "分切包装中") curGateKey = "gate3";
                else if (p.status === "测试验证中") curGateKey = "gate4";
                
                if (curGateKey && plan[curGateKey]) {
                    const planEndStr = plan[curGateKey].plan_end_date;
                    if (planEndStr) {
                        const planEndDate = new Date(planEndStr);
                        // 如果当前时间已经超过计划完成时间
                        if (now > planEndDate) {
                            const diffDays = Math.ceil((now - planEndDate) / (1000 * 60 * 60 * 24));
                            const owner = plan[curGateKey].owner || "项目负责人";
                            alerts.push({
                                type: "warning",
                                title: `【门禁延期】G${curGateKey.slice(-1)} 阶段超期预警`,
                                desc: `新品 ${p.name} (${p.code}) 当前处于 [${p.status}] 阶段，已超期 ${diffDays} 天。责任人：${owner}`,
                                time: p.updated_at || p.created_at,
                                icon: "alert-triangle"
                            });
                        }
                    }
                }
            }
        });
    }

    // 3. 添加一个默认的品质偏离预警
    alerts.push({
        type: "danger",
        title: "【品质异常】粗糙度测定偏离预警",
        desc: "极薄载体箔试验批次 P-HIS-02052 溶铜槽液温度异常偏高（3.2℃），引发生箔粗糙度 Rz 测定值偏离目标值（实测 0.98μm / 目标 <=0.80μm），已触发工艺门禁自动熔断。",
        time: new Date(Date.now() - 3600000 * 2).toISOString(),
        icon: "zap"
    });

    // 按时间降序排序
    alerts.sort((a, b) => new Date(b.time) - new Date(a.time));

    if (alerts.length === 0) {
        timelineEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 20px 0;">当前暂无待办及智能预警</div>`;
        return;
    }

    alerts.forEach(alt => {
        const card = document.createElement("div");
        card.className = `warning-alert-card ${alt.type}`;
        
        let iconName = alt.icon;
        let iconColorClass = `${alt.type}-color`;
        
        card.innerHTML = `
            <div class="warning-alert-icon ${iconColorClass}">
                <i data-lucide="${iconName}" style="width: 14px; height: 14px;"></i>
            </div>
            <div class="warning-alert-content">
                <div class="warning-alert-title">
                    <span>${alt.title}</span>
                </div>
                <div class="warning-alert-desc">${alt.desc}</div>
                <div class="warning-alert-time">
                    <i data-lucide="clock" style="width: 11px; height: 11px;"></i>
                    <span>${formatDate(alt.time)}</span>
                </div>
            </div>
        `;
        timelineEl.appendChild(card);
    });
    
    lucide.createIcons({
        attrs: {
            "stroke-width": 2
        },
        nameAttr: "data-lucide",
        node: timelineEl
    });
}

// ======================== 管控模块四：DMS 文管中心 (Document Management System) ========================
const DMS_TEMPLATES_SPEC = {
    // G1
    "NPI_Project_Proposal.pdf": {
        name: "高频铜箔开发立项申请书",
        description: "界定铜箔研发范围、市场应用前景、预计投资收益及项目核心班子。",
        fields: [
            { key: "项目代号", val: "例：PTS-AI-01 (高频高速专用)" },
            { key: "市场背景", val: "随着5G高频与AI算力大爆发，服务器PCB板对极低损耗铜箔提出迫切需求" },
            { key: "开发周期", val: "预计45天（G1-G5）" },
            { key: "投资估算", val: "研发试产预算: 150万元" },
            { key: "项目组", val: "项目经理：张经理；工艺主管：李工；品质主管：陈工" }
        ],
        checklist: ["立项论证意见书", "前沿竞品指标对标单", "中试资源申请表"]
    },
    "Technical_Agreement_TDS.pdf": {
        name: "技术协议规格定义书(TDS)",
        description: "固化目标规格限值，作为研发阶段及终点检验的基准协议标尺。",
        fields: [
            { key: "毛面粗糙度 Rz 限值", val: "目标值 <= 1.20 μm (或依产品类别而定)" },
            { key: "剥离强度下限", val: "目标值 >= 0.75 N/mm" },
            { key: "10GHz Df 传输损耗", val: "目标值 <= 0.0013" },
            { key: "抗拉强度极值", val: "目标值 >= 310 MPa" },
            { key: "延伸率极限", val: "目标值 >= 2.5 %" }
        ],
        checklist: ["技术协议会签单", "产品标称厚度偏差标准", "客户特殊物性规格输入表"]
    },
    "Feasibility_Benchmark.pdf": {
        name: "研发可行性分析及竞品对标报告",
        description: "对标日本三井、圣戈班等国际先进铜箔技术指标，论证量产线改造可行性。",
        fields: [
            { key: "技术可行性", val: "现有4#生箔机及添加剂系统可支撑超薄与超低粗糙度均匀化电解" },
            { key: "对标对象", val: "日本三井 RTF-Type / VLP-Type 高频铜箔" },
            { key: "工艺瓶颈", val: "溶铜电解液中Cl离子及微量添加剂高精度闭环在线滴定" },
            { key: "专利合规", val: "配方不涉及侵权风险，为自主知识产权明胶/骨胶添加物方案" }
        ],
        checklist: ["专利查新检索报告", "关键设备负荷测算表", "物料供应本地化评估单"]
    },
    // G2
    "Formulation_BOM_V1.0.xlsx": {
        name: "首发配方清单(BOM V1.0)",
        description: "确定初始阴极生箔液添加剂与表处化学配比标准表。",
        fields: [
            { key: "高纯铜线配比", val: "占比 99.85%" },
            { key: "电子级硫酸浓度", val: "占比 0.15%" },
            { key: "生箔添加剂 Gel", val: "基准 5.2 ppm (生箔结晶晶向控制)" },
            { key: "生箔添加剂 Hec", val: "基准 3.5 ppm" },
            { key: "生箔添加剂 S", val: "基准 8.0 ppm" },
            { key: "硅烷偶联剂类型", val: "常规硅烷-201 / 浓度基准 0.8%" }
        ],
        checklist: ["配方安全性评估单", "供应商化学品安全规范MSDS", "新物料准入品质控制卡"]
    },
    "Electrolyte_Chemistry_Spec.pdf": {
        name: "电解液组分化学检测规范",
        description: "为溅镀工段及循环槽液的铜酸浓度、杂质微量分析确立滴定标准。",
        fields: [
            { key: "Cu离子浓度控制", val: "标准范围：80 ~ 85 g/L" },
            { key: "H2SO4硫酸浓度控制", val: "标准范围：110 ~ 120 g/L" },
            { key: "Cl氯离子电解液限值", val: "标准范围：30 ~ 35 ppm" },
            { key: "Fe/Pb微量金属杂质", val: "最大允许限值：Fe <= 50 ppm, Pb <= 5 ppm" }
        ],
        checklist: ["电解液分析仪器校准记录", "槽液定时滴定取样路线图", "异常槽液调整备忘录"]
    },
    "Grain_SEM_Analysis.pdf": {
        name: "铜箔金相微观晶粒分析报告",
        description: "通过扫描电镜 (SEM) 观测生箔结晶微观结构，确保晶粒均匀微细且无粗大结晶。",
        fields: [
            { key: "观测倍率", val: "SEM 2000x / 5000x 金相显微" },
            { key: "毛面微观形貌", val: "呈均匀圆锥状微米颗粒，无长条柱状晶或撕裂坑" },
            { key: "截面晶粒度", val: "平均晶粒直径 <= 1.5 μm" },
            { key: "结晶取向指数", val: "XRD (220)/(111) 面衍射晶向特定强度比" }
        ],
        checklist: ["扫描电镜SEM观测原片", "晶粒度标定数据表", "粗晶预防控制卡"]
    },
    // G3
    "DVT_Routing_Card.xlsx": {
        name: "中试工艺路线图与参数卡",
        description: "固化中试试产的工段设备编号及标准运行参数阈值范围。",
        fields: [
            { key: "溶铜运行参数", val: "槽液温度 80±2 ℃，流量 450±10 L/min" },
            { key: "生箔运行参数", val: "电流密度 65±2 A/dm²，机台电压 6.8±0.1 V" },
            { key: "表处运行参数", val: "极板电流 1800±50 A，干燥温度 130±5 ℃" },
            { key: "分切运行参数", val: "收卷张力 220±10 N，分切速度 150±5 m/min" }
        ],
        checklist: ["工艺规程签审单", "设备点检指导卡", "中试防错(Poka-yoke)核对清单"]
    },
    "Drum_Deviation_Study.pdf": {
        name: "生箔阴极辊工艺偏离分析报告",
        description: "测试阴极辊运行温差波动及电流密度分布对铜箔厚度及粗糙度极差的影响。",
        fields: [
            { key: "测试设备", val: "2#生箔机阴极钛辊" },
            { key: "温度极差测试", val: "阴极辊左-中-right三点表面温差 <= 0.8 ℃" },
            { key: "偏离拉偏极值", val: "在电流密度拉偏5%时，分析结晶均匀度和粗糙度Rz极差波动" },
            { key: "结论预防", val: "当辊面局部温差达1.5℃时，Rz极差将增加0.15μm，需开启辊温水冷闭环" }
        ],
        checklist: ["阴极辊表面温度极差数据表", "厚度横向分布雷达图", "极差异常纠正单"]
    },
    "DVT_Pilot_Lot_Report.pdf": {
        name: "中试首批试产测试报告",
        description: "中试千米卷材全检物性数据分析，判定物理和电气性能达标状态。",
        fields: [
            { key: "试产长度", val: "双轴收卷 1200 m" },
            { key: "拉伸性能", val: "抗拉强度均值 322 MPa (目标 >=310)，延伸率 2.8% (目标 >=2.5)" },
            { key: "高频损耗 Df", val: "10GHz 实测 0.00122 (目标 <=0.00130)" },
            { key: "剥离强度", val: "常态剥离 0.78 N/mm，热应力后剥离 0.72 N/mm" }
        ],
        checklist: ["中试性能全检记录表", "工艺偏离控制会商单", "客户样品送检合格证"]
    },
    // G4
    "PVT_Industrial_Spec.pdf": {
        name: "生箔及表处量产标准作业指导书(SOP)",
        description: "PVT阶段固化的量产线标准操作法与异常应急熔断机制。",
        fields: [
            { key: "生箔操作规程", val: "极板极距校准 8±0.2 mm，阴极辊面硬度定期打磨标准" },
            { key: "表处操作规程", val: "化学防氧化槽 pH 值 4.2~4.8，烘干段热风风速 18 m/s" },
            { key: "溶铜操作规程", val: "铜颗粒酸洗标准，酸雾回收排风频次" },
            { key: "突发异常熔断", val: "当在线电导率偏差 > 10% 时，需即时切断电镀主电源并排空溢流槽" }
        ],
        checklist: ["作业指导书会签审批单", "安全应急响应预案书", "关键岗位资质矩阵表"]
    },
    "PVT_Yield_Analysis.pdf": {
        name: "PVT生产验证良率及波动性分析报告",
        description: "分析连续三批次大货生产的厚度极差、Rz波动和力学缺陷，计算CPK值。",
        fields: [
            { key: "评估批次", val: "批次 P-PTS-0701 / 0702 / 0703 连续大卷试产" },
            { key: "厚度极差波动", val: "均值 12.03 μm，极差波动 0.22 μm" },
            { key: "物性过程能力", val: "抗拉强度 Cpk = 1.68，延伸率 Cpk = 1.55" },
            { key: "缺陷分布", val: "针孔率 0.02 个/㎡，无针孔及撕边撕口严重缺陷" }
        ],
        checklist: ["物性过程能力CPK分析表", "过程控制图(SPC)趋势图", "良率异常分析改善报告"]
    },
    "Customer_DVT_Feedback.pdf": {
        name: "客户二方及终端现场审核反馈报告",
        description: "台达、华通等大客户针对样品试装及现场工艺稽核提出的整改闭环单。",
        fields: [
            { key: "审核客户", val: "台达电子品质稽核组 / 华通研发中心" },
            { key: "现场发现项", val: "3#表处烘干段辊面防粘特氟龙层存在微量划痕" },
            { key: "试装结论", val: "高频板压合良率 99.2%，剥离强度热冲击测试无分层起泡" },
            { key: "整改纠正", val: "已更换烘干段特氟龙保护辊，并升级清洗气刀防堵孔网" }
        ],
        checklist: ["客户现场发现项整改回执", "大客户试装认可签证书", "纠正预防措施(CAPA)跟踪卡"]
    },
    // G5
    "Mass_Production_Release.pdf": {
        name: "量产批准及研发结项归档报告",
        description: "五阶段门禁完整闭环，NPI结项，产品正式切入量产主数据通道。",
        fields: [
            { key: "结项状态", val: "NPI G1-G5 五大门禁闭环，全票签署通过" },
            { key: "量产交接", val: "交接至生箔车间及品质部，技术资料受控分发完毕" },
            { key: "终产率目标", val: "综合一次合格良率定标为 95.5%" },
            { key: "文件清单归档", val: "TDS、BOM、SOP、FMEA、QC工程表已全部归档入DMS系统" }
        ],
        checklist: ["新品量产移交单", "项目预算决算审计书", "团队结项嘉奖提名表"]
    },
    "FMEA_Risk_Registry.xlsx": {
        name: "设计及制造潜在失效模式分析(FMEA)",
        description: "识别铜箔制造全工序潜在风险因子，确立RPN严重度及纠正措施。",
        fields: [
            { key: "核心风险-生箔", val: "添加剂瞬时波动引发粗晶 (RPN: 120) -> 措施: 升级计量泵为双闭环称重给料" },
            { key: "核心风险-表处", val: "硅烷皮膜不均引发剥离斑点 (RPN: 105) -> 措施: 引入激光在线测厚及浓度回馈" },
            { key: "核心风险-溶铜", val: "铜线杂质偏高污染槽液 (RPN: 90) -> 措施: 强制每批高纯铜原材料谱图全元素检验" },
            { key: "核心风险-分切", val: "张力不稳致端面错位起皱 (RPN: 80) -> 措施: SOP规定收卷恒张力锥度曲线校准" }
        ],
        checklist: ["设计FMEA分析记录", "制造FMEA控制计划(CP)", "高RPN风险降低追踪表"]
    },
    "QC_Engineering_Standard.xlsx": {
        name: "量产质量控制工程表(QC卡)",
        description: "确定量产各工段的首检、巡检、终检频次、控制工具及检验指标基准。",
        fields: [
            { key: "溶铜控制点", val: "铜酸比重每2小时在线滴定，Cl离子每班次光谱分析" },
            { key: "生箔控制点", val: "厚度均一性在线扫描仪连续测量，表面粗糙度每卷首尾采样" },
            { key: "表处控制点", val: "剥离强度每批次层压样板检验，耐热变色每班次烘箱拉偏" },
            { key: "出货控制点", val: "外观缺陷 100% 自动光学检测 (AOI) 扫描，抗拉强度批批全检" }
        ],
        checklist: ["QC工程表签审单", "过程计量器具台账", "出货检验规范(AQL)标准书"]
    }
};

window.renderDmsPanel = function() {
    const activeProd = state.activeProduct || state.products[0];
    if (activeProd) {
        state.activeProductId = activeProd.id;
        
        const titleEl = document.getElementById("dms-selected-product-title");
        if (titleEl) {
            titleEl.innerHTML = `<i data-lucide="folder-git"></i> 技术规格与研发归档：${activeProd.name}`;
        }
        
        const metaEl = document.getElementById("dms-selected-product-meta");
        if (metaEl) {
            metaEl.innerText = `产品代号: ${activeProd.code} | 标称厚度: ${activeProd.spec_thickness}μm | 表面配方: ${activeProd.surface_treatment || 'STD常规'} | 当前生命周期状态: ${activeProd.status}`;
        }
        
        renderDmsDeliverablesTable(activeProd);
        lucide.createIcons();
    }
};

function renderDmsDeliverablesTable(product) {
    const tbody = document.querySelector("#dms-deliverables-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    // 15个标准交付文档 (关联真实生产工序)
    const docs = [
        { phase: "G1 立项阶段", stage: "立项规划", code: "NPI_Project_Proposal.pdf", spec: DMS_TEMPLATES_SPEC["NPI_Project_Proposal.pdf"] },
        { phase: "G1 立项阶段", stage: "设计标准", code: "Technical_Agreement_TDS.pdf", spec: DMS_TEMPLATES_SPEC["Technical_Agreement_TDS.pdf"] },
        { phase: "G1 立项阶段", stage: "立项规划", code: "Feasibility_Benchmark.pdf", spec: DMS_TEMPLATES_SPEC["Feasibility_Benchmark.pdf"] },
        
        { phase: "G2 配方阶段", stage: "溅镀工段", code: "Formulation_BOM_V1.0.xlsx", spec: DMS_TEMPLATES_SPEC["Formulation_BOM_V1.0.xlsx"] },
        { phase: "G2 配方阶段", stage: "溅镀工段", code: "Electrolyte_Chemistry_Spec.pdf", spec: DMS_TEMPLATES_SPEC["Electrolyte_Chemistry_Spec.pdf"] },
        { phase: "G2 配方阶段", stage: "电镀工段", code: "Grain_SEM_Analysis.pdf", spec: DMS_TEMPLATES_SPEC["Grain_SEM_Analysis.pdf"] },
        
        { phase: "G3 中试阶段", stage: "溅镀工段", code: "DVT_Routing_Card.xlsx", spec: DMS_TEMPLATES_SPEC["DVT_Routing_Card.xlsx"] },
        { phase: "G3 中试阶段", stage: "电镀工段", code: "Drum_Deviation_Study.pdf", spec: DMS_TEMPLATES_SPEC["Drum_Deviation_Study.pdf"] },
        { phase: "G3 中试阶段", stage: "生箔/表处", code: "DVT_Pilot_Lot_Report.pdf", spec: DMS_TEMPLATES_SPEC["DVT_Pilot_Lot_Report.pdf"] },
        
        { phase: "G4 验证阶段", stage: "表面处理", code: "PVT_Industrial_Spec.pdf", spec: DMS_TEMPLATES_SPEC["PVT_Industrial_Spec.pdf"] },
        { phase: "G4 验证阶段", stage: "分切工段", code: "PVT_Yield_Analysis.pdf", spec: DMS_TEMPLATES_SPEC["PVT_Yield_Analysis.pdf"] },
        { phase: "G4 验证阶段", stage: "品质质检", code: "Customer_DVT_Feedback.pdf", spec: DMS_TEMPLATES_SPEC["Customer_DVT_Feedback.pdf"] },
        
        { phase: "G5 量产阶段", stage: "结项归档", code: "Mass_Production_Release.pdf", spec: DMS_TEMPLATES_SPEC["Mass_Production_Release.pdf"] },
        { phase: "G5 量产阶段", stage: "品质质检", code: "FMEA_Risk_Registry.xlsx", spec: DMS_TEMPLATES_SPEC["FMEA_Risk_Registry.xlsx"] },
        { phase: "G5 量产阶段", stage: "品质质检", code: "QC_Engineering_Standard.xlsx", spec: DMS_TEMPLATES_SPEC["QC_Engineering_Standard.xlsx"] }
    ];

    docs.forEach(d => {
        const tr = document.createElement("tr");
        
        let versionText = "V1.0 (模版期)";
        let statusBadge = `<span class="badge badge-secondary">模版预置</span>`;
        
        if (d.code === "Technical_Agreement_TDS.pdf" && product.tds) {
            versionText = product.tds.tds_version || "V1.0";
            statusBadge = `<span class="badge badge-success">受控发布</span>`;
        } else if (d.code === "Formulation_BOM_V1.0.xlsx" && product.bom) {
            versionText = product.bom.version || "V1.0";
            statusBadge = `<span class="badge badge-success">受控归档</span>`;
        } else if (d.code === "DVT_Routing_Card.xlsx" && product.routing_list && product.routing_list.length > 0) {
            const activeRouting = product.routing_list.find(r => r.status === '活动') || product.routing_list[0];
            versionText = activeRouting.version || "R1.0";
            statusBadge = `<span class="badge badge-success">工艺定稿</span>`;
        }

        let stageBadge = "";
        if (d.stage === "溅镀工段") {
            stageBadge = `<span class="badge" style="background:rgba(59,130,246,0.08); color:#3b82f6; border:1px solid rgba(59,130,246,0.2);">溅镀工段</span>`;
        } else if (d.stage === "溅镀工段") {
            stageBadge = `<span class="badge" style="background:rgba(6,182,212,0.08); color:#06b6d4; border:1px solid rgba(6,182,212,0.2);">溅镀工段</span>`;
        } else if (d.stage === "电镀工段") {
            stageBadge = `<span class="badge" style="background:rgba(139,92,246,0.08); color:#8b5cf6; border:1px solid rgba(139,92,246,0.2);">电镀工段</span>`;
        } else if (d.stage === "表面处理") {
            stageBadge = `<span class="badge" style="background:rgba(249,115,22,0.08); color:#f97316; border:1px solid rgba(249,115,22,0.2);">表面处理</span>`;
        } else if (d.stage === "分切工段") {
            stageBadge = `<span class="badge" style="background:rgba(132,204,22,0.08); color:#84cc16; border:1px solid rgba(132,204,22,0.2);">分切工段</span>`;
        } else if (d.stage === "品质质检") {
            stageBadge = `<span class="badge" style="background:rgba(239,68,68,0.08); color:#ef4444; border:1px solid rgba(239,68,68,0.2);">品质质检</span>`;
        } else {
            stageBadge = `<span class="badge" style="background:rgba(148,163,184,0.08); color:#94a3b8; border:1px solid rgba(148,163,184,0.2);">${d.stage}</span>`;
        }

        tr.innerHTML = `
            <td style="font-size:0.72rem; color:var(--text-secondary);">${d.phase}</td>
            <td>${stageBadge}</td>
            <td style="font-weight:600; font-size:0.75rem;">${d.spec.name}</td>
            <td style="font-size:0.72rem; color:var(--text-muted); font-family:monospace;">${d.code}</td>
            <td style="font-size:0.72rem; font-family:monospace;">${versionText}</td>
            <td>${statusBadge}</td>
            <td>
                <div style="display:flex; gap:8px;">
                    <button class="btn-xs btn-outline" onclick="previewDmsTemplate('${d.code}', '${d.spec.name}')">
                        <i data-lucide="eye" style="width:11px; height:11px; display:inline-block; vertical-align:middle; margin-top:-2px;"></i> 预览
                    </button>
                    <button class="btn-xs btn-secondary" onclick="downloadDmsTemplate('${d.code}', '${d.spec.name}')">
                        <i data-lucide="download" style="width:11px; height:11px; display:inline-block; vertical-align:middle; margin-top:-2px;"></i> 下载
                    </button>
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
}

window.previewDmsTemplate = function(fileCode, fileName) {
    const spec = DMS_TEMPLATES_SPEC[fileCode];
    if (!spec) {
        showToast("该文件规格尚未配置模版预览数据", "warning");
        return;
    }

    const selectedProd = state.products.find(p => p.id === state.dmsActiveProductId) || {};

    // 判定是否有正式发布的活动 TDS 规格
    const hasActiveTds = fileCode === "Technical_Agreement_TDS.pdf" && selectedProd.tds && selectedProd.tds.tds_items && selectedProd.tds.tds_items.length > 0;
    const activeTdsVersion = hasActiveTds ? selectedProd.tds.tds_version : null;

    // 判定是否有正式定型的活动 BOM 配方
    const hasActiveBom = fileCode === "Formulation_BOM_V1.0.xlsx" && selectedProd.bom && selectedProd.bom.bom_items && selectedProd.bom.bom_items.length > 0;
    const activeBomVersion = hasActiveBom ? selectedProd.bom.version : null;

    // 动态计算文件名
    let finalFileName = fileName;
    if (activeTdsVersion) {
        finalFileName = `Technical_Agreement_TDS_${activeTdsVersion}.pdf`;
    } else if (activeBomVersion) {
        finalFileName = `Formulation_BOM_${activeBomVersion}.pdf`;
    }

    // 设置 PDF 标题
    document.getElementById("dms-pdf-title").innerText = `${finalFileName} - NPI研发受控归档文档`;

    // 动态生成正文表格 Header 与 Rows
    let tableHeaderHtml = "";
    let fieldsHtml = "";
    
    if (hasActiveTds) {
        tableHeaderHtml = `
            <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0; text-align:center; width:45px;">序号</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">检验项目 (ZH / EN)</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0; text-align:center; width:120px;">技术规格限值</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569;">检测标准方法</th>
            </tr>
        `;
        selectedProd.tds.tds_items.forEach((item, idx) => {
            const num = item.item_no !== undefined ? item.item_no : (idx + 1);
            const fullName = `${item.name_zh || ''}${item.name_en ? ' (' + item.name_en + ')' : ''}`;
            const limit = `${item.spec || ''} ${item.unit || ''}`;
            const method = item.test_standard || '内控企业标准';
            
            fieldsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; font-size: 0.72rem; border-right: 1px solid #e2e8f0; text-align:center; color:#64748b;">${num}</td>
                    <td style="padding: 8px 10px; font-weight: 600; color: #334155; font-size: 0.72rem; border-right: 1px solid #e2e8f0;">${fullName}</td>
                    <td style="padding: 8px 10px; color: #b91c1c; font-weight: 700; font-size: 0.72rem; border-right: 1px solid #e2e8f0; text-align:center; background:#fff5f5;">${limit}</td>
                    <td style="padding: 8px 10px; color: #475569; font-size: 0.72rem;">${method}</td>
                </tr>
            `;
        });
    } else if (hasActiveBom) {
        tableHeaderHtml = `
            <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0; text-align:center; width:45px;">序号</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">原料配方代码</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">物料中文名称及规格</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; text-align:center; width:120px;">投料配比值</th>
            </tr>
        `;
        selectedProd.bom.bom_items.forEach((item, idx) => {
            const num = idx + 1;
            const matCode = item.material_code || `MAT-ADD-${num}`;
            const matName = `${item.material_name || ''}${item.material_spec ? ' (' + item.material_spec + ')' : ''}`;
            const ratio = `${item.ratio_value || '0'} ${item.unit || '%'}`;
            
            fieldsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; font-size: 0.72rem; border-right: 1px solid #e2e8f0; text-align:center; color:#64748b;">${num}</td>
                    <td style="padding: 8px 10px; font-size: 0.72rem; border-right: 1px solid #e2e8f0; font-family:monospace;">${matCode}</td>
                    <td style="padding: 8px 10px; font-weight: 600; color: #334155; font-size: 0.72rem; border-right: 1px solid #e2e8f0;">${matName}</td>
                    <td style="padding: 8px 10px; color: #15803d; font-weight: 700; font-size: 0.72rem; text-align:center; background:#f0fdf4;">${ratio}</td>
                </tr>
            `;
        });
    } else {
        tableHeaderHtml = `
            <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 8px 12px; font-size: 0.74rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">规范模板字段</th>
                <th style="padding: 8px 12px; font-size: 0.74rem; font-weight: bold; color: #475569;">标准取值与填报要求</th>
            </tr>
        `;
        spec.fields.forEach(f => {
            fieldsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 10px 12px; font-weight: 600; color: #334155; font-size: 0.76rem; width: 160px; background: #f8fafc; border-right: 1px solid #e2e8f0;">${f.key}</td>
                    <td style="padding: 10px 12px; color: #1e293b; font-size: 0.76rem;">${f.val}</td>
                </tr>
            `;
        });
    }

    // 动态生成合规核对单
    let checklistHtml = "";
    spec.checklist.forEach(c => {
        checklistHtml += `
            <li style="display: flex; align-items: center; gap: 8px; font-size: 0.74rem; color: #475569; padding: 2px 0;">
                <i data-lucide="check-square" style="width: 13px; height: 13px; color: #10b981; flex-shrink:0;"></i>
                <span>${c}</span>
            </li>
        `;
    });

    // 水印与红色印章样式
    const stampSvg = `
        <div style="position: absolute; top: 40px; right: 40px; z-index: 15; transform: rotate(-8deg); pointer-events: none; opacity: 0.85;">
            <svg width="105" height="105" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#ef4444" stroke-width="2.2" />
                <circle cx="60" cy="60" r="49" fill="none" stroke="#ef4444" stroke-width="0.8" />
                <polygon points="60,37 63,47 73,47 65,53 68,63 60,57 52,63 55,53 47,47 57,47" fill="#ef4444" />
                <path id="circlePath" d="M 18,60 A 42,42 0 0,1 102,60" fill="none" stroke="none" />
                <text fill="#ef4444" font-size="8.2" font-weight="bold" letter-spacing="1">
                    <textPath href="#circlePath" startOffset="50%" text-anchor="middle">
                        GHZ 高频铜箔研发中心
                    </textPath>
                </text>
                <path id="circlePathBottom" d="M 102,60 A 42,42 0 0,1 18,60" fill="none" stroke="none" />
                <text fill="#ef4444" font-size="8.8" font-weight="bold" letter-spacing="1.2">
                    <textPath href="#circlePathBottom" startOffset="50%" text-anchor="middle">
                        NPI 受控文件专用章
                    </textPath>
                </text>
            </svg>
        </div>
    `;

    const canvas = document.getElementById("dms-pdf-canvas");
    if (!canvas) return;
    canvas.innerHTML = "";

    // 创建 A4 容器
    const a4Page = document.createElement("div");
    a4Page.style.width = "100%";
    a4Page.style.maxWidth = "660px";
    a4Page.style.minHeight = "800px";
    a4Page.style.background = "#ffffff";
    a4Page.style.color = "#0f172a";
    a4Page.style.padding = "40px";
    a4Page.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.4)";
    a4Page.style.margin = "0 auto";
    a4Page.style.position = "relative";
    a4Page.style.overflow = "hidden";
    a4Page.style.borderRadius = "4px";

    // 创建斜平铺受控水印
    const watermark = document.createElement("div");
    watermark.style.position = "absolute";
    watermark.style.top = "0";
    watermark.style.left = "0";
    watermark.style.width = "100%";
    watermark.style.height = "100%";
    watermark.style.pointerEvents = "none";
    watermark.style.zIndex = "10";
    watermark.style.opacity = "0.04";
    watermark.style.backgroundImage = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><text x='30' y='100' font-size='12' font-weight='bold' fill='%23000000' transform='rotate(-30 100 100)'>NPI CONTROLLED</text><text x='45' y='120' font-size='10' fill='%23000000' transform='rotate(-30 100 100)'>受控文件 严禁复制</text></svg>")`;

    a4Page.appendChild(watermark);

    // 将印章及受控正文渲染进 A4 纸张
    const containerDiv = document.createElement("div");
    containerDiv.style.position = "relative";
    containerDiv.style.zIndex = "12";
    
    // 动态拼接版本
    let versionLabel = "V1.0.0 受控版";
    if (activeTdsVersion) {
        versionLabel = `${activeTdsVersion} 正式发布版`;
    } else if (activeBomVersion) {
        versionLabel = `${activeBomVersion} 受控定型版`;
    }
    const parameterTitle = (activeTdsVersion || activeBomVersion) ? "二、 核心规范指标与参数数据" : "二、 核心规范指标与参数样表";

    containerDiv.innerHTML = `
        ${stampSvg}
        
        <!-- 文件头部 -->
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
            <div style="font-size: 0.65rem; color: #475569; font-weight: bold; letter-spacing: 1px; margin-bottom: 4px;">GHZ COPPER FOIL CO., LTD. &middot; NPI SYSTEM</div>
            <h1 style="font-size: 1.35rem; font-weight: 800; color: #0f172a; margin: 0;">研发交付物规范与受控技术文档</h1>
            <div style="font-size: 0.72rem; color: #64748b; margin-top: 4px; font-family: monospace;">文档物理编码：${fileCode}</div>
        </div>

        <!-- 元信息受控表 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 20px; font-size: 0.74rem;">
            <div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">对应产品：</strong><span style="color: #0f172a; font-weight:600;">${selectedProd.name} (${selectedProd.code})</span></div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">处理配方：</strong><span style="color: #1e3a8a; font-weight:600;">${selectedProd.surface_treatment || 'STD常规'}</span></div>
                <div><strong style="color: #475569;">管理密级：</strong><span style="color: #ef4444; font-weight:600;">机密 (NPI CONTROLLED)</span></div>
            </div>
            <div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">编制部门：</strong><span style="color: #0f172a;">高频铜箔研发中心</span></div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">版本信息：</strong><span style="color: #0f172a; font-family: monospace;">${versionLabel}</span></div>
                <div><strong style="color: #475569;">当前日期：</strong><span style="color: #0f172a; font-family: monospace;">2026年7月8日</span></div>
            </div>
        </div>

        <!-- 说明区 -->
        <div style="margin-bottom: 20px;">
            <h3 style="font-size: 0.82rem; font-weight: bold; color: #0f172a; margin: 0 0 6px 0;">一、 文档目的与大纲说明</h3>
            <p style="font-size: 0.74rem; line-height: 1.5; color: #334155; margin: 0; text-indent: 20px;">${spec.description}</p>
        </div>

        <!-- 技术参数与表格正文 -->
        <div style="margin-bottom: 20px;">
            <h3 style="font-size: 0.82rem; font-weight: bold; color: #0f172a; margin: 0 0 8px 0;">${parameterTitle}</h3>
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #ffffff;">
                <table style="width: 100%; border-collapse: collapse; border: none; text-align: left;">
                    <thead>
                        ${tableHeaderHtml}
                    </thead>
                    <tbody>
                        ${fieldsHtml}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 签署审计Checklist -->
        <div style="background: #ecfdf5; border: 1px dashed #a7f3d0; border-radius: 6px; padding: 14px; margin-bottom: 24px;">
            <h4 style="font-size: 0.76rem; font-weight: bold; color: #065f46; margin: 0 0 8px 0; display: flex; align-items: center; gap: 4px;">
                <i data-lucide="shield-check" style="width:14px; height:14px;"></i> 合规性审计核对单 (Checklist)
            </h4>
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px;">
                ${checklistHtml}
            </ul>
        </div>

        <!-- 签署栏 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; font-size: 0.7rem; border-top: 1px dashed #cbd5e1; padding-top: 16px; color: #475569;">
            <div>
                <strong>起草人签署：</strong>
                <div style="font-style: italic; font-weight: bold; font-family: Georgia, serif; font-size: 1.1rem; color: #1e3a8a; height: 28px; line-height: 28px; padding-left: 10px;">
                    ${selectedProd.creator || "张经理"}
                </div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">研发项目经理</div>
            </div>
            <div>
                <strong>校对人签署：</strong>
                <div style="font-style: italic; font-weight: bold; font-family: Georgia, serif; font-size: 1.1rem; color: #1e3a8a; height: 28px; line-height: 28px; padding-left: 10px;">
                    李建国
                </div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">工艺高级专家</div>
            </div>
            <div>
                <strong>批准人签署：</strong>
                <div style="font-style: italic; font-weight: bold; font-family: Georgia, serif; font-size: 1.1rem; color: #1e3a8a; height: 28px; line-height: 28px; padding-left: 10px;">
                    傅青炫
                </div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">研发总监</div>
            </div>
        </div>
    `;
    a4Page.appendChild(containerDiv);
    canvas.appendChild(a4Page);

    // 绑定顶部下载按钮
    document.getElementById("btn-dms-pdf-download").onclick = () => {
        closeModal("modal-dms-template-preview");
        downloadDmsTemplate(fileCode, finalFileName);
    };

    openModal("modal-dms-template-preview");

    lucide.createIcons({
        attrs: {
            "stroke-width": 2
        },
        nameAttr: "data-lucide",
        node: canvas
    });
};

window.downloadDmsTemplate = function(fileCode, fileName) {
    const selectedProd = state.products.find(p => p.id === state.dmsActiveProductId) || {};
    
    // 判定是否有 TDS 和 BOM
    const hasActiveTds = fileCode === "Technical_Agreement_TDS.pdf" && selectedProd.tds && selectedProd.tds.tds_items && selectedProd.tds.tds_items.length > 0;
    const hasActiveBom = fileCode === "Formulation_BOM_V1.0.xlsx" && selectedProd.bom && selectedProd.bom.bom_items && selectedProd.bom.bom_items.length > 0;
    
    let displayFileName = fileName;
    if (hasActiveTds) {
        displayFileName = `Technical_Agreement_TDS_${selectedProd.tds.tds_version}.csv`;
    } else if (hasActiveBom) {
        displayFileName = `Formulation_BOM_${selectedProd.bom.version}.csv`;
    } else {
        displayFileName = `${fileCode.split('.')[0]}_模版_CP.csv`;
    }
    
    showToast(`已成功启动受控归档文档下载：${displayFileName}`, "success");
    
    const spec = DMS_TEMPLATES_SPEC[fileCode];
    if (!spec) return;

    let csvContent = "\uFEFF"; // BOM
    csvContent += `文档受控名称,${hasActiveTds ? ('技术协议规格书_' + selectedProd.tds.tds_version) : (hasActiveBom ? ('配方单BOM_' + selectedProd.bom.version) : spec.name)}\n`;
    csvContent += `物理文档编码,${fileCode}\n`;
    csvContent += `管理密级,机密 (NPI受控)\n`;
    csvContent += `归档说明,${spec.description}\n\n`;
    
    if (hasActiveTds) {
        csvContent += "序号,检验项目,技术规格限值,检测标准方法\n";
        selectedProd.tds.tds_items.forEach((item, idx) => {
            const num = item.item_no !== undefined ? item.item_no : (idx + 1);
            const fullName = `${item.name_zh || ''}${item.name_en ? ' / ' + item.name_en : ''}`;
            const limit = `${item.spec || ''} ${item.unit || ''}`;
            const method = item.test_standard || '内控标准';
            csvContent += `"${num}","${fullName}","${limit}","${method}"\n`;
        });
    } else if (hasActiveBom) {
        csvContent += "序号,原料配方代码,物料中文名称及规格说明,投料配比值\n";
        selectedProd.bom.bom_items.forEach((item, idx) => {
            const num = idx + 1;
            const matCode = item.material_code || `MAT-ADD-${num}`;
            const matName = `${item.material_name || ''}${item.material_spec ? ' / ' + item.material_spec : ''}`;
            const ratio = `${item.ratio_value || '0'} ${item.unit || '%'}`;
            csvContent += `"${num}","${matCode}","${matName}","${ratio}"\n`;
        });
    } else {
        csvContent += "项目节点,参数标准/技术规格\n";
        spec.fields.forEach(f => {
            csvContent += `"${f.key}","${f.val}"\n`;
        });
    }
    
    csvContent += "\n审计确认项\n";
    spec.checklist.forEach(c => {
        csvContent += `"${c}","[x] 已由审计委员会签署通过"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", displayFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// ======================== 管控模块四：DMS 文管中心 (Document Management System) ========================
const DMS_TEMPLATES_SPEC = {
    // G1
    "NPI_Project_Proposal.pdf": {
        name: "高频铜箔开发立项申请书",
        description: "界定铜箔研发范围、市场应用前景、预计投资收益及项目核心班子。",
        fields: [
            { key: "项目代号", val: "例：PTS-AI-01 (高频高速专用)" },
            { key: "市场背景", val: "随着5G高频与AI算力大爆发，服务器PCB板对极低损耗铜箔提出迫切需求" },
            { key: "开发周期", val: "预计45天（G1-G5）" },
            { key: "投资估算", val: "研发试产预算: 150万元" },
            { key: "项目组", val: "项目经理：张经理；工艺主管：李工；品质主管：陈工" }
        ],
        checklist: ["立项论证意见书", "前沿竞品指标对标单", "中试资源申请表"]
    },
    "Technical_Agreement_TDS.pdf": {
        name: "技术协议规格定义书(TDS)",
        description: "固化目标规格限值，作为研发阶段及终点检验的基准协议标尺。",
        fields: [
            { key: "毛面粗糙度 Rz 限值", val: "目标值 <= 1.20 μm (或依产品类别而定)" },
            { key: "剥离强度下限", val: "目标值 >= 0.75 N/mm" },
            { key: "10GHz Df 传输损耗", val: "目标值 <= 0.0013" },
            { key: "抗拉强度极值", val: "目标值 >= 310 MPa" },
            { key: "延伸率极限", val: "目标值 >= 2.5 %" }
        ],
        checklist: ["技术协议会签单", "产品标称厚度偏差标准", "客户特殊物性规格输入表"]
    },
    "Feasibility_Benchmark.pdf": {
        name: "研发可行性分析及竞品对标报告",
        description: "对标日本三井、圣戈班等国际先进铜箔技术指标，论证量产线改造可行性。",
        fields: [
            { key: "技术可行性", val: "现有4#生箔机及添加剂系统可支撑超薄与超低粗糙度均匀化电解" },
            { key: "对标对象", val: "日本三井 RTF-Type / VLP-Type 高频铜箔" },
            { key: "工艺瓶颈", val: "溶铜电解液中Cl离子及微量添加剂高精度闭环在线滴定" },
            { key: "专利合规", val: "配方不涉及侵权风险，为自主知识产权明胶/骨胶添加物方案" }
        ],
        checklist: ["专利查新检索报告", "关键设备负荷测算表", "物料供应本地化评估单"]
    },
    // G2
    "Formulation_BOM_V1.0.xlsx": {
        name: "首发配方清单(BOM V1.0)",
        description: "确定初始阴极生箔液添加剂与表处化学配比标准表。",
        fields: [
            { key: "高纯铜线配比", val: "占比 99.85%" },
            { key: "电子级硫酸浓度", val: "占比 0.15%" },
            { key: "生箔添加剂 Gel", val: "基准 5.2 ppm (生箔结晶晶向控制)" },
            { key: "生箔添加剂 Hec", val: "基准 3.5 ppm" },
            { key: "生箔添加剂 S", val: "基准 8.0 ppm" },
            { key: "硅烷偶联剂类型", val: "常规硅烷-201 / 浓度基准 0.8%" }
        ],
        checklist: ["配方安全性评估单", "供应商化学品安全规范MSDS", "新物料准入品质控制卡"]
    },
    "Electrolyte_Chemistry_Spec.pdf": {
        name: "电解液组分化学检测规范",
        description: "为溅镀工段及循环槽液的铜酸浓度、杂质微量分析确立滴定标准。",
        fields: [
            { key: "Cu离子浓度控制", val: "标准范围：80 ~ 85 g/L" },
            { key: "H2SO4硫酸浓度控制", val: "标准范围：110 ~ 120 g/L" },
            { key: "Cl氯离子电解液限值", val: "标准范围：30 ~ 35 ppm" },
            { key: "Fe/Pb微量金属杂质", val: "最大允许限值：Fe <= 50 ppm, Pb <= 5 ppm" }
        ],
        checklist: ["电解液分析仪器校准记录", "槽液定时滴定取样路线图", "异常槽液调整备忘录"]
    },
    "Grain_SEM_Analysis.pdf": {
        name: "铜箔金相微观晶粒分析报告",
        description: "通过扫描电镜 (SEM) 观测生箔结晶微观结构，确保晶粒均匀微细且无粗大结晶。",
        fields: [
            { key: "观测倍率", val: "SEM 2000x / 5000x 金相显微" },
            { key: "毛面微观形貌", val: "呈均匀圆锥状微米颗粒，无长条柱状晶或撕裂坑" },
            { key: "截面晶粒度", val: "平均晶粒直径 <= 1.5 μm" },
            { key: "结晶取向指数", val: "XRD (220)/(111) 面衍射晶向特定强度比" }
        ],
        checklist: ["扫描电镜SEM观测原片", "晶粒度标定数据表", "粗晶预防控制卡"]
    },
    // G3
    "DVT_Routing_Card.xlsx": {
        name: "中试工艺路线图与参数卡",
        description: "固化中试试产的工段设备编号及标准运行参数阈值范围。",
        fields: [
            { key: "溶铜运行参数", val: "槽液温度 80±2 ℃，流量 450±10 L/min" },
            { key: "生箔运行参数", val: "电流密度 65±2 A/dm²，机台电压 6.8±0.1 V" },
            { key: "表处运行参数", val: "极板电流 1800±50 A，干燥温度 130±5 ℃" },
            { key: "分切运行参数", val: "收卷张力 220±10 N，分切速度 150±5 m/min" }
        ],
        checklist: ["工艺规程签审单", "设备点检指导卡", "中试防错(Poka-yoke)核对清单"]
    },
    "Drum_Deviation_Study.pdf": {
        name: "生箔阴极辊工艺偏离分析报告",
        description: "测试阴极辊运行温差波动及电流密度分布对铜箔厚度及粗糙度极差的影响。",
        fields: [
            { key: "测试设备", val: "2#生箔机阴极钛辊" },
            { key: "温度极差测试", val: "阴极辊左-中-right三点表面温差 <= 0.8 ℃" },
            { key: "偏离拉偏极值", val: "在电流密度拉偏5%时，分析结晶均匀度和粗糙度Rz极差波动" },
            { key: "结论预防", val: "当辊面局部温差达1.5℃时，Rz极差将增加0.15μm，需开启辊温水冷闭环" }
        ],
        checklist: ["阴极辊表面温度极差数据表", "厚度横向分布雷达图", "极差异常纠正单"]
    },
    "DVT_Pilot_Lot_Report.pdf": {
        name: "中试首批试产测试报告",
        description: "中试千米卷材全检物性数据分析，判定物理和电气性能达标状态。",
        fields: [
            { key: "试产长度", val: "双轴收卷 1200 m" },
            { key: "拉伸性能", val: "抗拉强度均值 322 MPa (目标 >=310)，延伸率 2.8% (目标 >=2.5)" },
            { key: "高频损耗 Df", val: "10GHz 实测 0.00122 (目标 <=0.00130)" },
            { key: "剥离强度", val: "常态剥离 0.78 N/mm，热应力后剥离 0.72 N/mm" }
        ],
        checklist: ["中试性能全检记录表", "工艺偏离控制会商单", "客户样品送检合格证"]
    },
    // G4
    "PVT_Industrial_Spec.pdf": {
        name: "生箔及表处量产标准作业指导书(SOP)",
        description: "PVT阶段固化的量产线标准操作法与异常应急熔断机制。",
        fields: [
            { key: "生箔操作规程", val: "极板极距校准 8±0.2 mm，阴极辊面硬度定期打磨标准" },
            { key: "表处操作规程", val: "化学防氧化槽 pH 值 4.2~4.8，烘干段热风风速 18 m/s" },
            { key: "溶铜操作规程", val: "铜颗粒酸洗标准，酸雾回收排风频次" },
            { key: "突发异常熔断", val: "当在线电导率偏差 > 10% 时，需即时切断电镀主电源并排空溢流槽" }
        ],
        checklist: ["作业指导书会签审批单", "安全应急响应预案书", "关键岗位资质矩阵表"]
    },
    "PVT_Yield_Analysis.pdf": {
        name: "PVT生产验证良率及波动性分析报告",
        description: "分析连续三批次大货生产的厚度极差、Rz波动和力学缺陷，计算CPK值。",
        fields: [
            { key: "评估批次", val: "批次 P-PTS-0701 / 0702 / 0703 连续大卷试产" },
            { key: "厚度极差波动", val: "均值 12.03 μm，极差波动 0.22 μm" },
            { key: "物性过程能力", val: "抗拉强度 Cpk = 1.68，延伸率 Cpk = 1.55" },
            { key: "缺陷分布", val: "针孔率 0.02 个/㎡，无针孔及撕边撕口严重缺陷" }
        ],
        checklist: ["物性过程能力CPK分析表", "过程控制图(SPC)趋势图", "良率异常分析改善报告"]
    },
    "Customer_DVT_Feedback.pdf": {
        name: "客户二方及终端现场审核反馈报告",
        description: "台达、华通等大客户针对样品试装及现场工艺稽核提出的整改闭环单。",
        fields: [
            { key: "审核客户", val: "台达电子品质稽核组 / 华通研发中心" },
            { key: "现场发现项", val: "3#表处烘干段辊面防粘特氟龙层存在微量划痕" },
            { key: "试装结论", val: "高频板压合良率 99.2%，剥离强度热冲击测试无分层起泡" },
            { key: "整改纠正", val: "已更换烘干段特氟龙保护辊，并升级清洗气刀防堵孔网" }
        ],
        checklist: ["客户现场发现项整改回执", "大客户试装认可签证书", "纠正预防措施(CAPA)跟踪卡"]
    },
    // G5
    "Mass_Production_Release.pdf": {
        name: "量产批准及研发结项归档报告",
        description: "五阶段门禁完整闭环，NPI结项，产品正式切入量产主数据通道。",
        fields: [
            { key: "结项状态", val: "NPI G1-G5 五大门禁闭环，全票签署通过" },
            { key: "量产交接", val: "交接至生箔车间及品质部，技术资料受控分发完毕" },
            { key: "终产率目标", val: "综合一次合格良率定标为 95.5%" },
            { key: "文件清单归档", val: "TDS、BOM、SOP、FMEA、QC工程表已全部归档入DMS系统" }
        ],
        checklist: ["新品量产移交单", "项目预算决算审计书", "团队结项嘉奖提名表"]
    },
    "FMEA_Risk_Registry.xlsx": {
        name: "设计及制造潜在失效模式分析(FMEA)",
        description: "识别铜箔制造全工序潜在风险因子，确立RPN严重度及纠正措施。",
        fields: [
            { key: "核心风险-生箔", val: "添加剂瞬时波动引发粗晶 (RPN: 120) -> 措施: 升级计量泵为双闭环称重给料" },
            { key: "核心风险-表处", val: "硅烷皮膜不均引发剥离斑点 (RPN: 105) -> 措施: 引入激光在线测厚及浓度回馈" },
            { key: "核心风险-溶铜", val: "铜线杂质偏高污染槽液 (RPN: 90) -> 措施: 强制每批高纯铜原材料谱图全元素检验" },
            { key: "核心风险-分切", val: "张力不稳致端面错位起皱 (RPN: 80) -> 措施: SOP规定收卷恒张力锥度曲线校准" }
        ],
        checklist: ["设计FMEA分析记录", "制造FMEA控制计划(CP)", "高RPN风险降低追踪表"]
    },
    "QC_Engineering_Standard.xlsx": {
        name: "量产质量控制工程表(QC卡)",
        description: "确定量产各工段的首检、巡检、终检频次、控制工具及检验指标基准。",
        fields: [
            { key: "溶铜控制点", val: "铜酸比重每2小时在线滴定，Cl离子每班次光谱分析" },
            { key: "生箔控制点", val: "厚度均一性在线扫描仪连续测量，表面粗糙度每卷首尾采样" },
            { key: "表处控制点", val: "剥离强度每批次层压样板检验，耐热变色每班次烘箱拉偏" },
            { key: "出货控制点", val: "外观缺陷 100% 自动光学检测 (AOI) 扫描，抗拉强度批批全检" }
        ],
        checklist: ["QC工程表签审单", "过程计量器具台账", "出货检验规范(AQL)标准书"]
    }
};

window.renderDmsPanel = function() {
    const filterCategory = document.getElementById("dms-category-filter").value;
    const listContainer = document.getElementById("dms-products-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    const filtered = state.products.filter(p => !filterCategory || p.category === filterCategory);

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.8rem; padding:20px;">无匹配产品</div>`;
        return;
    }

    filtered.forEach(p => {
        const item = document.createElement("div");
        item.className = `dms-prod-item ${state.dmsActiveProductId === p.id ? 'active' : ''}`;
        item.onclick = () => {
            state.dmsActiveProductId = p.id;
            saveStateToLocalStorage();
            renderDmsPanel();
        };

        let badgeClass = "badge-info";
        if (p.status === "量产中") badgeClass = "badge-success";
        else if (p.status.includes("审批")) badgeClass = "badge-warning";
        
        item.innerHTML = `
            <div style="font-weight: 700; font-size: 0.82rem; margin-bottom: 2px;">${p.name}</div>
            <div style="font-size: 0.72rem; color: var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
                <span>代号: ${p.code}</span>
                <span class="badge ${badgeClass}" style="transform:scale(0.9); transform-origin:right;">${p.status}</span>
            </div>
        `;
        listContainer.appendChild(item);
    });

    const activeProd = state.products.find(p => p.id === state.dmsActiveProductId) || filtered[0];
    if (activeProd) {
        state.dmsActiveProductId = activeProd.id;
        document.getElementById("dms-active-product-name").innerText = `${activeProd.name} (${activeProd.code})`;
        renderDmsDeliverablesTable(activeProd);
    }
};

function renderDmsDeliverablesTable(product) {
    const tbody = document.querySelector("#dms-deliverables-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    // 15个标准交付文档
    const docs = [
        { phase: "G1 立项阶段", code: "NPI_Project_Proposal.pdf", spec: DMS_TEMPLATES_SPEC["NPI_Project_Proposal.pdf"] },
        { phase: "G1 立项阶段", code: "Technical_Agreement_TDS.pdf", spec: DMS_TEMPLATES_SPEC["Technical_Agreement_TDS.pdf"] },
        { phase: "G1 立项阶段", code: "Feasibility_Benchmark.pdf", spec: DMS_TEMPLATES_SPEC["Feasibility_Benchmark.pdf"] },
        
        { phase: "G2 配方阶段", code: "Formulation_BOM_V1.0.xlsx", spec: DMS_TEMPLATES_SPEC["Formulation_BOM_V1.0.xlsx"] },
        { phase: "G2 配方阶段", code: "Electrolyte_Chemistry_Spec.pdf", spec: DMS_TEMPLATES_SPEC["Electrolyte_Chemistry_Spec.pdf"] },
        { phase: "G2 配方阶段", code: "Grain_SEM_Analysis.pdf", spec: DMS_TEMPLATES_SPEC["Grain_SEM_Analysis.pdf"] },
        
        { phase: "G3 中试阶段", code: "DVT_Routing_Card.xlsx", spec: DMS_TEMPLATES_SPEC["DVT_Routing_Card.xlsx"] },
        { phase: "G3 中试阶段", code: "Drum_Deviation_Study.pdf", spec: DMS_TEMPLATES_SPEC["Drum_Deviation_Study.pdf"] },
        { phase: "G3 中试阶段", code: "DVT_Pilot_Lot_Report.pdf", spec: DMS_TEMPLATES_SPEC["DVT_Pilot_Lot_Report.pdf"] },
        
        { phase: "G4 验证阶段", code: "PVT_Industrial_Spec.pdf", spec: DMS_TEMPLATES_SPEC["PVT_Industrial_Spec.pdf"] },
        { phase: "G4 验证阶段", code: "PVT_Yield_Analysis.pdf", spec: DMS_TEMPLATES_SPEC["PVT_Yield_Analysis.pdf"] },
        { phase: "G4 验证阶段", code: "Customer_DVT_Feedback.pdf", spec: DMS_TEMPLATES_SPEC["Customer_DVT_Feedback.pdf"] },
        
        { phase: "G5 量产阶段", code: "Mass_Production_Release.pdf", spec: DMS_TEMPLATES_SPEC["Mass_Production_Release.pdf"] },
        { phase: "G5 量产阶段", code: "FMEA_Risk_Registry.xlsx", spec: DMS_TEMPLATES_SPEC["FMEA_Risk_Registry.xlsx"] },
        { phase: "G5 量产阶段", code: "QC_Engineering_Standard.xlsx", spec: DMS_TEMPLATES_SPEC["QC_Engineering_Standard.xlsx"] }
    ];

    docs.forEach(d => {
        const tr = document.createElement("tr");
        
        // 智能关联版本
        let versionText = "V1.0 (模版期)";
        let statusBadge = `<span class="badge badge-secondary">模版预置</span>`;
        
        if (d.code === "Technical_Agreement_TDS.pdf" && product.tds) {
            versionText = product.tds.tds_version || "V1.0";
            statusBadge = `<span class="badge badge-success">受控发布</span>`;
        } else if (d.code === "Formulation_BOM_V1.0.xlsx" && product.bom) {
            versionText = product.bom.version || "V1.0";
            statusBadge = `<span class="badge badge-success">受控归档</span>`;
        } else if (d.code === "DVT_Routing_Card.xlsx" && product.routing_list && product.routing_list.length > 0) {
            // 获取活动版本
            const activeRouting = product.routing_list.find(r => r.status === '活动') || product.routing_list[0];
            versionText = activeRouting.version || "R1.0";
            statusBadge = `<span class="badge badge-success">工艺定稿</span>`;
        }

        tr.innerHTML = `
            <td style="font-size:0.72rem; color:var(--text-secondary);">${d.phase}</td>
            <td style="font-weight:600; font-size:0.75rem;">${d.spec.name}</td>
            <td style="font-size:0.72rem; color:var(--text-muted); font-family:monospace;">${d.code}</td>
            <td style="font-size:0.72rem; font-family:monospace;">${versionText}</td>
            <td>${statusBadge}</td>
            <td>
                <div style="display:flex; gap:8px;">
                    <button class="btn-xs btn-outline" onclick="previewDmsTemplate('${d.code}', '${d.spec.name}')">
                        <i data-lucide="eye" style="width:11px; height:11px; display:inline-block; vertical-align:middle; margin-top:-2px;"></i> 预览
                    </button>
                    <button class="btn-xs btn-secondary" onclick="downloadDmsTemplate('${d.code}', '${d.spec.name}')">
                        <i data-lucide="download" style="width:11px; height:11px; display:inline-block; vertical-align:middle; margin-top:-2px;"></i> 下载
                    </button>
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
}

window.previewDmsTemplate = function(fileCode, fileName) {
    const spec = DMS_TEMPLATES_SPEC[fileCode];
    if (!spec) {
        showToast("该文件规格尚未配置模版预览数据", "warning");
        return;
    }

    const selectedProd = state.products.find(p => p.id === state.dmsActiveProductId) || {};

    // 判定是否有正式发布的活动 TDS 规格
    const hasActiveTds = fileCode === "Technical_Agreement_TDS.pdf" && selectedProd.tds && selectedProd.tds.tds_items && selectedProd.tds.tds_items.length > 0;
    const activeTdsVersion = hasActiveTds ? selectedProd.tds.tds_version : null;

    // 判定是否有正式定型的活动 BOM 配方
    const hasActiveBom = fileCode === "Formulation_BOM_V1.0.xlsx" && selectedProd.bom && selectedProd.bom.bom_items && selectedProd.bom.bom_items.length > 0;
    const activeBomVersion = hasActiveBom ? selectedProd.bom.version : null;

    // 动态计算文件名
    let finalFileName = fileName;
    if (activeTdsVersion) {
        finalFileName = `Technical_Agreement_TDS_${activeTdsVersion}.pdf`;
    } else if (activeBomVersion) {
        finalFileName = `Formulation_BOM_${activeBomVersion}.pdf`;
    }

    // 设置 PDF 标题
    document.getElementById("dms-pdf-title").innerText = `${finalFileName} - NPI研发受控归档文档`;

    // 动态生成正文表格 Header 与 Rows
    let tableHeaderHtml = "";
    let fieldsHtml = "";
    
    if (hasActiveTds) {
        tableHeaderHtml = `
            <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0; text-align:center; width:45px;">序号</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">检验项目 (ZH / EN)</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0; text-align:center; width:120px;">技术规格限值</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569;">检测标准方法</th>
            </tr>
        `;
        selectedProd.tds.tds_items.forEach((item, idx) => {
            const num = item.item_no !== undefined ? item.item_no : (idx + 1);
            const fullName = `${item.name_zh || ''}${item.name_en ? ' (' + item.name_en + ')' : ''}`;
            const limit = `${item.spec || ''} ${item.unit || ''}`;
            const method = item.test_standard || '内控企业标准';
            
            fieldsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; font-size: 0.72rem; border-right: 1px solid #e2e8f0; text-align:center; color:#64748b;">${num}</td>
                    <td style="padding: 8px 10px; font-weight: 600; color: #334155; font-size: 0.72rem; border-right: 1px solid #e2e8f0;">${fullName}</td>
                    <td style="padding: 8px 10px; color: #b91c1c; font-weight: 700; font-size: 0.72rem; border-right: 1px solid #e2e8f0; text-align:center; background:#fff5f5;">${limit}</td>
                    <td style="padding: 8px 10px; color: #475569; font-size: 0.72rem;">${method}</td>
                </tr>
            `;
        });
    } else if (hasActiveBom) {
        tableHeaderHtml = `
            <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0; text-align:center; width:45px;">序号</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">原料配方代码</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">物料中文名称及规格</th>
                <th style="padding: 8px 10px; font-size: 0.72rem; font-weight: bold; color: #475569; text-align:center; width:120px;">投料配比值</th>
            </tr>
        `;
        selectedProd.bom.bom_items.forEach((item, idx) => {
            const num = idx + 1;
            const matCode = item.material_code || `MAT-ADD-${num}`;
            const matName = `${item.material_name || ''}${item.material_spec ? ' (' + item.material_spec + ')' : ''}`;
            const ratio = `${item.ratio_value || '0'} ${item.unit || '%'}`;
            
            fieldsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; font-size: 0.72rem; border-right: 1px solid #e2e8f0; text-align:center; color:#64748b;">${num}</td>
                    <td style="padding: 8px 10px; font-size: 0.72rem; border-right: 1px solid #e2e8f0; font-family:monospace;">${matCode}</td>
                    <td style="padding: 8px 10px; font-weight: 600; color: #334155; font-size: 0.72rem; border-right: 1px solid #e2e8f0;">${matName}</td>
                    <td style="padding: 8px 10px; color: #15803d; font-weight: 700; font-size: 0.72rem; text-align:center; background:#f0fdf4;">${ratio}</td>
                </tr>
            `;
        });
    } else {
        tableHeaderHtml = `
            <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 8px 12px; font-size: 0.74rem; font-weight: bold; color: #475569; border-right: 1px solid #e2e8f0;">规范模板字段</th>
                <th style="padding: 8px 12px; font-size: 0.74rem; font-weight: bold; color: #475569;">标准取值与填报要求</th>
            </tr>
        `;
        spec.fields.forEach(f => {
            fieldsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 10px 12px; font-weight: 600; color: #334155; font-size: 0.76rem; width: 160px; background: #f8fafc; border-right: 1px solid #e2e8f0;">${f.key}</td>
                    <td style="padding: 10px 12px; color: #1e293b; font-size: 0.76rem;">${f.val}</td>
                </tr>
            `;
        });
    }

    // 动态生成合规核对单
    let checklistHtml = "";
    spec.checklist.forEach(c => {
        checklistHtml += `
            <li style="display: flex; align-items: center; gap: 8px; font-size: 0.74rem; color: #475569; padding: 2px 0;">
                <i data-lucide="check-square" style="width: 13px; height: 13px; color: #10b981; flex-shrink:0;"></i>
                <span>${c}</span>
            </li>
        `;
    });

    // 水印与红色印章样式
    const stampSvg = `
        <div style="position: absolute; top: 40px; right: 40px; z-index: 15; transform: rotate(-8deg); pointer-events: none; opacity: 0.85;">
            <svg width="105" height="105" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#ef4444" stroke-width="2.2" />
                <circle cx="60" cy="60" r="49" fill="none" stroke="#ef4444" stroke-width="0.8" />
                <polygon points="60,37 63,47 73,47 65,53 68,63 60,57 52,63 55,53 47,47 57,47" fill="#ef4444" />
                <path id="circlePath" d="M 18,60 A 42,42 0 0,1 102,60" fill="none" stroke="none" />
                <text fill="#ef4444" font-size="8.2" font-weight="bold" letter-spacing="1">
                    <textPath href="#circlePath" startOffset="50%" text-anchor="middle">
                        GHZ 高频铜箔研发中心
                    </textPath>
                </text>
                <path id="circlePathBottom" d="M 102,60 A 42,42 0 0,1 18,60" fill="none" stroke="none" />
                <text fill="#ef4444" font-size="8.8" font-weight="bold" letter-spacing="1.2">
                    <textPath href="#circlePathBottom" startOffset="50%" text-anchor="middle">
                        NPI 受控文件专用章
                    </textPath>
                </text>
            </svg>
        </div>
    `;

    const canvas = document.getElementById("dms-pdf-canvas");
    if (!canvas) return;
    canvas.innerHTML = "";

    // 创建 A4 容器
    const a4Page = document.createElement("div");
    a4Page.style.width = "100%";
    a4Page.style.maxWidth = "660px";
    a4Page.style.minHeight = "800px";
    a4Page.style.background = "#ffffff";
    a4Page.style.color = "#0f172a";
    a4Page.style.padding = "40px";
    a4Page.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.4)";
    a4Page.style.margin = "0 auto";
    a4Page.style.position = "relative";
    a4Page.style.overflow = "hidden";
    a4Page.style.borderRadius = "4px";

    // 创建斜平铺受控水印
    const watermark = document.createElement("div");
    watermark.style.position = "absolute";
    watermark.style.top = "0";
    watermark.style.left = "0";
    watermark.style.width = "100%";
    watermark.style.height = "100%";
    watermark.style.pointerEvents = "none";
    watermark.style.zIndex = "10";
    watermark.style.opacity = "0.04";
    watermark.style.backgroundImage = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><text x='30' y='100' font-size='12' font-weight='bold' fill='%23000000' transform='rotate(-30 100 100)'>NPI CONTROLLED</text><text x='45' y='120' font-size='10' fill='%23000000' transform='rotate(-30 100 100)'>受控文件 严禁复制</text></svg>")`;

    a4Page.appendChild(watermark);

    // 将印章及受控正文渲染进 A4 纸张
    const containerDiv = document.createElement("div");
    containerDiv.style.position = "relative";
    containerDiv.style.zIndex = "12";
    
    // 动态拼接版本
    let versionLabel = "V1.0.0 受控版";
    if (activeTdsVersion) {
        versionLabel = `${activeTdsVersion} 正式发布版`;
    } else if (activeBomVersion) {
        versionLabel = `${activeBomVersion} 受控定型版`;
    }
    const parameterTitle = (activeTdsVersion || activeBomVersion) ? "二、 核心规范指标与参数数据" : "二、 核心规范指标与参数样表";

    containerDiv.innerHTML = `
        ${stampSvg}
        
        <!-- 文件头部 -->
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
            <div style="font-size: 0.65rem; color: #475569; font-weight: bold; letter-spacing: 1px; margin-bottom: 4px;">GHZ COPPER FOIL CO., LTD. &middot; NPI SYSTEM</div>
            <h1 style="font-size: 1.35rem; font-weight: 800; color: #0f172a; margin: 0;">研发交付物规范与受控技术文档</h1>
            <div style="font-size: 0.72rem; color: #64748b; margin-top: 4px; font-family: monospace;">文档物理编码：${fileCode}</div>
        </div>

        <!-- 元信息受控表 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 20px; font-size: 0.74rem;">
            <div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">对应产品：</strong><span style="color: #0f172a; font-weight:600;">${selectedProd.name} (${selectedProd.code})</span></div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">处理配方：</strong><span style="color: #1e3a8a; font-weight:600;">${selectedProd.surface_treatment || 'STD常规'}</span></div>
                <div><strong style="color: #475569;">管理密级：</strong><span style="color: #ef4444; font-weight:600;">机密 (NPI CONTROLLED)</span></div>
            </div>
            <div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">编制部门：</strong><span style="color: #0f172a;">高频铜箔研发中心</span></div>
                <div style="margin-bottom: 4px;"><strong style="color: #475569;">版本信息：</strong><span style="color: #0f172a; font-family: monospace;">${versionLabel}</span></div>
                <div><strong style="color: #475569;">当前日期：</strong><span style="color: #0f172a; font-family: monospace;">2026年7月8日</span></div>
            </div>
        </div>

        <!-- 说明区 -->
        <div style="margin-bottom: 20px;">
            <h3 style="font-size: 0.82rem; font-weight: bold; color: #0f172a; margin: 0 0 6px 0;">一、 文档目的与大纲说明</h3>
            <p style="font-size: 0.74rem; line-height: 1.5; color: #334155; margin: 0; text-indent: 20px;">${spec.description}</p>
        </div>

        <!-- 技术参数与表格正文 -->
        <div style="margin-bottom: 20px;">
            <h3 style="font-size: 0.82rem; font-weight: bold; color: #0f172a; margin: 0 0 8px 0;">${parameterTitle}</h3>
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #ffffff;">
                <table style="width: 100%; border-collapse: collapse; border: none; text-align: left;">
                    <thead>
                        ${tableHeaderHtml}
                    </thead>
                    <tbody>
                        ${fieldsHtml}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 签署审计Checklist -->
        <div style="background: #ecfdf5; border: 1px dashed #a7f3d0; border-radius: 6px; padding: 14px; margin-bottom: 24px;">
            <h4 style="font-size: 0.76rem; font-weight: bold; color: #065f46; margin: 0 0 8px 0; display: flex; align-items: center; gap: 4px;">
                <i data-lucide="shield-check" style="width:14px; height:14px;"></i> 合规性审计核对单 (Checklist)
            </h4>
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px;">
                ${checklistHtml}
            </ul>
        </div>

        <!-- 签署栏 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; font-size: 0.7rem; border-top: 1px dashed #cbd5e1; padding-top: 16px; color: #475569;">
            <div>
                <strong>起草人签署：</strong>
                <div style="font-style: italic; font-weight: bold; font-family: Georgia, serif; font-size: 1.1rem; color: #1e3a8a; height: 28px; line-height: 28px; padding-left: 10px;">
                    ${selectedProd.creator || "张经理"}
                </div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">研发项目经理</div>
            </div>
            <div>
                <strong>校对人签署：</strong>
                <div style="font-style: italic; font-weight: bold; font-family: Georgia, serif; font-size: 1.1rem; color: #1e3a8a; height: 28px; line-height: 28px; padding-left: 10px;">
                    李建国
                </div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">工艺高级专家</div>
            </div>
            <div>
                <strong>批准人签署：</strong>
                <div style="font-style: italic; font-weight: bold; font-family: Georgia, serif; font-size: 1.1rem; color: #1e3a8a; height: 28px; line-height: 28px; padding-left: 10px;">
                    傅青炫
                </div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">研发总监</div>
            </div>
        </div>
    `;
    a4Page.appendChild(containerDiv);
    canvas.appendChild(a4Page);

    // 绑定顶部下载按钮
    document.getElementById("btn-dms-pdf-download").onclick = () => {
        closeModal("modal-dms-template-preview");
        downloadDmsTemplate(fileCode, finalFileName);
    };

    openModal("modal-dms-template-preview");

    lucide.createIcons({
        attrs: {
            "stroke-width": 2
        },
        nameAttr: "data-lucide",
        node: canvas
    });
};

window.downloadDmsTemplate = function(fileCode, fileName) {
    const selectedProd = state.products.find(p => p.id === state.dmsActiveProductId) || {};
    
    // 判定是否有 TDS 和 BOM
    const hasActiveTds = fileCode === "Technical_Agreement_TDS.pdf" && selectedProd.tds && selectedProd.tds.tds_items && selectedProd.tds.tds_items.length > 0;
    const hasActiveBom = fileCode === "Formulation_BOM_V1.0.xlsx" && selectedProd.bom && selectedProd.bom.bom_items && selectedProd.bom.bom_items.length > 0;
    
    let displayFileName = fileName;
    if (hasActiveTds) {
        displayFileName = `Technical_Agreement_TDS_${selectedProd.tds.tds_version}.csv`;
    } else if (hasActiveBom) {
        displayFileName = `Formulation_BOM_${selectedProd.bom.version}.csv`;
    } else {
        displayFileName = `${fileCode.split('.')[0]}_模版_CP.csv`;
    }
    
    showToast(`已成功启动受控归档文档下载：${displayFileName}`, "success");
    
    const spec = DMS_TEMPLATES_SPEC[fileCode];
    if (!spec) return;

    let csvContent = "\uFEFF"; // BOM
    csvContent += `文档受控名称,${hasActiveTds ? ('技术协议规格书_' + selectedProd.tds.tds_version) : (hasActiveBom ? ('配方单BOM_' + selectedProd.bom.version) : spec.name)}\n`;
    csvContent += `物理文档编码,${fileCode}\n`;
    csvContent += `管理密级,机密 (NPI受控)\n`;
    csvContent += `归档说明,${spec.description}\n\n`;
    
    if (hasActiveTds) {
        csvContent += "序号,检验项目,技术规格限值,检测标准方法\n";
        selectedProd.tds.tds_items.forEach((item, idx) => {
            const num = item.item_no !== undefined ? item.item_no : (idx + 1);
            const fullName = `${item.name_zh || ''}${item.name_en ? ' / ' + item.name_en : ''}`;
            const limit = `${item.spec || ''} ${item.unit || ''}`;
            const method = item.test_standard || '内控标准';
            csvContent += `"${num}","${fullName}","${limit}","${method}"\n`;
        });
    } else if (hasActiveBom) {
        csvContent += "序号,原料配方代码,物料中文名称及规格说明,投料配比值\n";
        selectedProd.bom.bom_items.forEach((item, idx) => {
            const num = idx + 1;
            const matCode = item.material_code || `MAT-ADD-${num}`;
            const matName = `${item.material_name || ''}${item.material_spec ? ' / ' + item.material_spec : ''}`;
            const ratio = `${item.ratio_value || '0'} ${item.unit || '%'}`;
            csvContent += `"${num}","${matCode}","${matName}","${ratio}"\n`;
        });
    } else {
        csvContent += "项目节点,参数标准/技术规格\n";
        spec.fields.forEach(f => {
            csvContent += `"${f.key}","${f.val}"\n`;
        });
    }
    
    csvContent += "\n审计确认项\n";
    spec.checklist.forEach(c => {
        csvContent += `"${c}","[x] 已由审计委员会签署通过"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", displayFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
