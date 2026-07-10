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
    charts: {} // Chart.js
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
    "溶铜工段": [
        { key: "Cu_conc", name: "铜离子浓度", unit: "g/L", threshold: 2.0 },
        { key: "H2SO4_conc", name: "硫酸浓度", unit: "g/L", threshold: 5.0 },
        { key: "temp", name: "电解液温度", unit: "℃", threshold: 3.0 },
        { key: "flow_rate", name: "循环流速", unit: "m³/h", threshold: 20.0 },
        { key: "Cl_conc", name: "氯离子含量", unit: "ppm", threshold: 3.0 }
    ],
    "溅镀工段": [
        { key: "vacuum", name: "高真空度", unit: "Pa", threshold: 0.0001 },
        { key: "power", name: "溅射总功率", unit: "kW", threshold: 1.0 },
        { key: "speed", name: "运行线速度", unit: "m/min", threshold: 0.5 },
        { key: "thickness", name: "打底层厚度", unit: "nm", threshold: 5.0 }
    ],
    "生箔工段": [
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
    "PTS AI 铜箔": [12, 18, 35],
    "HIS 载体铜箔": [3, 2, 1.5],
    "背板双晶铜箔": [9, 12, 18]
};

function getStagesForProduct(category) {
    if (category === "HIS 载体铜箔") {
        return ["立项", "溶铜工段", "溅镀工段", "生箔工段", "表面处理工段", "分切工段", "测试验证", "量产送样"];
    } else {
        return ["立项", "溶铜工段", "生箔工段", "表面处理工段", "分切工段", "测试验证", "量产送样"];
    }
}

function getStatusActiveIndex(status, category) {
    const stages = getStagesForProduct(category);
    if (status === "立项中") return 0;
    if (status === "钉钉立项审批中") return 0;
    if (status === "溶铜造液中") return stages.indexOf("溶铜工段");
    if (status === "溅镀开发中") return stages.indexOf("溅镀工段");
    if (status === "生箔电镀中") return stages.indexOf("生箔工段");
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
        let fetchProductsPromise = new Promise((resolve) => {
            let url = "/api/products";
            if (categoryFilter) {
                url += `?category=${encodeURIComponent(categoryFilter)}`;
            }
            fetch(url)
                .then(res => res.json())
                .then(products => {
                    state.products = products;
                    renderSidebarProducts();
                    resolve();
                });
        });

        // 4. 拉取驾驶舱仪表盘
        fetchDashboardData();

        // 待侧边栏拉取完后再还原主 Tab 及产品详情
        fetchProductsPromise.then(() => {
            switchTab(state.activeTab);
            if (state.activeProductId) {
                loadProductDetails(state.activeProductId);
            }
        });

        fetchDingTalkSettings();
        setInterval(fetchDingTalkApprovals, 5000);
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

    document.getElementById("btn-new-project").addEventListener("click", () => {
        if (checkPermission(["Admin", "Product Manager"], "新品开发立项")) {
            openProjectModal();
        }
    });

    document.getElementById("proj-category").addEventListener("change", (e) => {
        updateThicknessOptions(e.target.value);
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
    
    const headerTitleMap = {
        'dashboard-panel': '研发驾驶舱 (高频铜箔生命周期总览)',
        'plm-panel': '产品全生命周期研发控制台 (PLM)',
        'ecn-panel': '工程变更管控中心 (ECN)',
        'dingtalk-panel': '钉钉协同配置与回调调试中心',
        'users-panel': '用户与系统角色权限控制台'
    };
    document.getElementById("header-panel-title").innerText = headerTitleMap[tabId] || 'PLM平台';

    if (tabId === 'plm-panel' && state.activeProductId) {
        loadProductDetails(state.activeProductId);
    } else if (tabId === 'dashboard-panel') {
        fetchDashboardData();
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

    if (state.activeProduct) {
        if (subTabId === 'npi') renderNpiSubpanel();
        else if (subTabId === 'tds') renderTdsSubpanel();
        else if (subTabId === 'bom') renderBomSubpanel();
        else if (subTabId === 'routing') renderRoutingSubpanel();
    }
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
        { key: "gate2", num: "G2", label: "配方定型" },
        { key: "gate3", num: "G3", label: "工艺与中试" },
        { key: "gate4", num: "G4", label: "品质验证" },
        { key: "gate5", num: "G5", label: "PPAP与量产" }
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

        // 动态数据联动区域 (Body)
        let bodyHtml = "";
        let footerHtml = "";

        // 统一渲染项目排期与负责人参数展示
        bodyHtml = `
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

        if (g.key === "gate1") {
            if (gateData.status === "RUNNING") {
                footerHtml = `<button class="btn-primary" style="font-size: 0.75rem; padding: 6px; width: 100%;" onclick="submitDingTalkApproval(${product.id}, 'PRODUCT')"><i data-lucide="send" style="width: 12px; height: 12px;"></i> 发起立项审批</button>`;
            } else if (gateData.status === "APPROVING") {
                footerHtml = `<button class="btn-secondary" style="font-size: 0.75rem; padding: 6px; width: 100%; border-color: var(--color-warning); color: var(--color-warning);" onclick="switchTab('dingtalk-panel')"><i data-lucide="clock" style="width: 12px; height: 12px;"></i> 去审批调试台</button>`;
            } else {
                footerHtml = `<button class="btn-secondary" style="font-size: 0.75rem; padding: 6px; width: 100%;" onclick="switchPlmSubTab('tds')"><i data-lucide="eye" style="width: 12px; height: 12px;"></i> 查看 TDS 限值</button>`;
            }
        } 
        
        else if (g.key === "gate2") {
            if (gateData.status === "RUNNING") {
                footerHtml = `<span style="font-size: 0.75rem; color: var(--color-warning); text-align: center; width: 100%;"><i data-lucide="refresh-cw" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 4px;"></i> ECN 设变审批中...</span>`;
            } else if (gateData.status !== "LOCKED") {
                footerHtml = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; width: 100%;">
                        <button class="btn-secondary" style="font-size: 0.7rem; padding: 6px;" onclick="switchPlmSubTab('bom')"><i data-lucide="eye" style="width: 11px; height: 11px;"></i> BOM</button>
                        <button class="btn-primary" style="font-size: 0.7rem; padding: 6px;" onclick="openEcnModalWithProduct(${product.id})"><i data-lucide="git-pull-request" style="width: 11px; height: 11px;"></i> 设变</button>
                    </div>
                `;
            } else {
                footerHtml = `<span style="font-size: 0.75rem; color: var(--text-muted); text-align: center; width: 100%;">配方尚未定型</span>`;
            }
        } 
        
        else if (g.key === "gate3") {
            if (gateData.status === "RUNNING") {
                footerHtml = `<button class="btn-primary" style="font-size: 0.75rem; padding: 6px; width: 100%;" onclick="jumpAndOpenRoutingLog()"><i data-lucide="plus-circle" style="width: 12px; height: 12px;"></i> 去录入中试参数</button>`;
            } else if (gateData.status !== "LOCKED") {
                footerHtml = `<button class="btn-secondary" style="font-size: 0.75rem; padding: 6px; width: 100%;" onclick="switchPlmSubTab('routing')"><i data-lucide="eye" style="width: 12px; height: 12px;"></i> 查看工艺中试</button>`;
            } else {
                footerHtml = `<span style="font-size: 0.75rem; color: var(--text-muted); text-align: center; width: 100%;">工艺尚未开启</span>`;
            }
        } 
        
        else if (g.key === "gate4") {
            if (gateData.status !== "LOCKED") {
                footerHtml = `<button class="btn-primary" style="font-size: 0.75rem; padding: 6px; width: 100%;" onclick="openQualityTestModal()"><i data-lucide="beaker" style="width: 12px; height: 12px;"></i> 录入品质数据</button>`;
            } else {
                footerHtml = `<span style="font-size: 0.75rem; color: var(--text-muted); text-align: center; width: 100%;">品质验证未开启</span>`;
            }
        } 
        
        else if (g.key === "gate5") {
            if (gateData.status === "COMPLETED") {
                footerHtml = `<span style="font-size: 0.75rem; color: var(--color-success); font-weight: bold; text-align: center; width: 100%;"><i data-lucide="check-circle" style="width: 12px; height: 12px; vertical-align: middle;"></i> 已成功导入量产</span>`;
            } else if (gateData.status === "RUNNING") {
                footerHtml = `<button class="btn-primary" style="font-size: 0.75rem; padding: 6px; width: 100%; background: linear-gradient(135deg, var(--color-success), #059669);" onclick="submitImportProduction(${product.id})"><i data-lucide="rocket" style="width: 12px; height: 12px;"></i> 申请导入量产</button>`;
            } else {
                footerHtml = `<span style="font-size: 0.75rem; color: var(--text-muted); text-align: center; width: 100%;">量产送样未就绪</span>`;
            }
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
            <div class="npi-gate-card-footer">
                ${footerHtml}
            </div>
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

    if (category === "PTS AI 铜箔") {
        roughness.value = "1.20";
        df.value = "0.0012";
        peel.value = "0.75";
        tensile.value = "310";
        elongation.value = "2.5";
        nameInput.value = `高频高速PTS AI铜箔(${thicknesses[0]}μm)`;
        codeInput.value = `HF-PTS-${thicknesses[0]}`;
    } else if (category === "HIS 载体铜箔") {
        roughness.value = "0.80";
        df.value = "0.0010";
        peel.value = "0.50";
        tensile.value = "290";
        elongation.value = "2.0";
        nameInput.value = `超薄HIS载体铜箔(${thicknesses[0]}μm)`;
        codeInput.value = `HF-HIS-0${parseInt(thicknesses[0])}`;
    } else if (category === "背板双晶铜箔") {
        roughness.value = "1.50";
        df.value = "0.0015";
        peel.value = "0.85";
        tensile.value = "340";
        elongation.value = "3.2";
        nameInput.value = `背板双晶铜箔(${thicknesses[0]}μm)`;
        codeInput.value = `HF-DBJ-${thicknesses[0]}`;
    }

    select.onchange = () => {
        const thick = select.value;
        if (category === "PTS AI 铜箔") {
            nameInput.value = `高频高速PTS AI铜箔(${thick}μm)`;
            codeInput.value = `HF-PTS-${thick}`;
        } else if (category === "HIS 载体铜箔") {
            nameInput.value = `超薄HIS载体铜箔(${thick}μm)`;
            codeInput.value = `HF-HIS-0${parseInt(thick)}`;
        } else if (category === "背板双晶铜箔") {
            nameInput.value = `背板双晶铜箔(${thick}μm)`;
            codeInput.value = `HF-DBJ-${thick}`;
        }
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
            
            const totalCount = products.length;
            const prodRate = totalCount > 0 ? ((productionCount / totalCount) * 100).toFixed(1) + "%" : "0.0%";

            document.getElementById("metric-developing").innerText = developingCount;
            document.getElementById("metric-prod-rate").innerText = prodRate;
            document.getElementById("metric-passrate").innerText = "96.8%";
            document.getElementById("metric-cpk").innerText = "1.62";

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
                renderAlertsTimeline(products, state.dingtalkLogs);
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
                    <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${e.change_reason}">${e.change_reason}</td>
                    <td><span class="badge ${getEcnStatusBadgeClass(e.status)}">${e.status}</span></td>
                    <td>${formatDate(e.created_at)}</td>
                `;
                tbody.appendChild(tr);
            });

            if (state.activeTab === 'dashboard-panel') {
                renderAlertsTimeline(state.products, state.dingtalkLogs);
            }
        });
}

function getEcnStatusBadgeClass(status) {
    if (status === "草稿") return "badge-gray";
    if (status === "钉钉审批中") return "badge-warning";
    if (status === "已批准") return "badge-green";
    if (status === "已拒绝") return "badge-danger";
    return "badge-gray";
}

// Render left sidebar product list
function renderSidebarProducts() {
    const listWrap = document.getElementById("sidebar-products-list");
    listWrap.innerHTML = "";

    state.products.forEach(p => {
        const item = document.createElement("div");
        item.className = `sidebar-prod-item ${p.id === state.activeProductId ? 'active' : ''}`;
        
        const statusColors = {
            "立项中": "#64748b",
            "钉钉立项审批中": "#f59e0b",
            "溶铜造液中": "#06b6d4",
            "溅镀开发中": "#8b5cf6",
            "生箔电镀中": "#3b82f6",
            "表面处理中": "#0ea5e9",
            "分切包装中": "#6366f1",
            "测试验证中": "#ec4899",
            "量产中": "#10b981",
            "废弃": "#ef4444"
        };
        const dotColor = statusColors[p.status] || "#fff";

        item.innerHTML = `
            <div class="sidebar-prod-code">
                <span>${p.code}</span>
                <span class="status-badge-dot" style="background-color: ${dotColor};" title="${p.status}"></span>
            </div>
            <div class="sidebar-prod-name">${p.name}</div>
        `;

        item.addEventListener("click", () => {
            state.activeProductId = p.id;
            switchTab('plm-panel');
            loadProductDetails(p.id);
        });

        listWrap.appendChild(item);
    });
}

// Load detailed product data from API
function loadProductDetails(id) {
    fetch(`/api/products/${id}`)
        .then(res => res.json())
        .then(product => {
            state.activeProduct = product;
            state.activeProductId = id;
            saveStateToLocalStorage();
            
            const catEl = document.getElementById("plm-prod-category");
            if (catEl) catEl.innerText = product.category;
            const nameEl = document.getElementById("plm-prod-name");
            if (nameEl) nameEl.innerText = `${product.name} (${product.code})`;
            const creatorEl = document.getElementById("plm-prod-creator");
            if (creatorEl) creatorEl.innerText = product.creator;
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

            // 渲染历史测试数据
            renderTestRecords(product.test_records);

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

    if (!updatedItem.name_zh || !updatedItem.spec) {
        showToast("中文检验项目名称和规格值必填！", "error");
        return;
    }

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
        showToast(successMsg || data.message, "success");
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
        showToast(data.message, "success");
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
    addDesignStep("溶铜工段", "新制液溶铜设备", "EQ-溶铜-NEW", defaultParams);
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

    const PRESET_STAGES = ["溶铜工段", ...(isHis ? ["溅镀工段"] : []), "生箔工段", "表面处理工段", "分切工段"];
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

    const PRESET_STAGES = ["溶铜工段", "溅镀工段", "生箔工段", "表面处理工段", "分切工段"];
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

function openProjectModal() {
    openModal("modal-project");
    document.getElementById("proj-category").value = "PTS AI 铜箔";
    updateThicknessOptions("PTS AI 铜箔");
}

function submitNewProject() {
    const payload = {
        code: document.getElementById("proj-code").value,
        name: document.getElementById("proj-name").value,
        category: document.getElementById("proj-category").value,
        spec_thickness: document.getElementById("proj-thickness").value,
        target_roughness: document.getElementById("proj-roughness").value,
        target_peel: document.getElementById("proj-peel").value,
        target_df: document.getElementById("proj-df").value,
        target_tensile: document.getElementById("proj-tensile").value,
        target_elongation: document.getElementById("proj-elongation").value,
        creator: document.getElementById("proj-creator").value
    };

    if (!payload.code || !payload.name) {
        showToast("请填写完整立项基本信息！", "error");
        return;
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

function renderTestRecords(records) {
    const tbody = document.querySelector("#plm-test-records-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">暂无检测批次报告数据</td></tr>`;
        return;
    }

    records.forEach(r => {
        const tr = document.createElement("tr");
        const dateStr = formatDate(r.created_at);
        const shortDate = dateStr && dateStr.length >= 10 ? dateStr.substring(0, 10) : dateStr;

        tr.innerHTML = `
            <td style="font-weight: 500;">${r.batch_no}</td>
            <td>${r.actual_thickness} μm</td>
            <td>${r.roughness_rz_m} / ${r.roughness_rz_s} μm</td>
            <td>${r.peel_strength} N/mm</td>
            <td>${r.df_10ghz}</td>
            <td>${r.tensile_strength} / ${r.elongation}%</td>
            <td><span class="badge ${r.test_result==='合格'?'badge-green':'badge-danger'}">${r.test_result}</span></td>
            <td>${r.tester}</td>
            <td>${shortDate}</td>
        `;
        tbody.appendChild(tr);
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

    // 新增：高频铜箔物性批次稳定性走势图 (双轴)
    if (state.charts.quality) {
        state.charts.quality.destroy();
    }

    const ctxLine = document.getElementById("chart-line-quality").getContext("2d");
    state.charts.quality = new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: ['批次-06', '批次-05', '批次-04', '批次-03', '批次-02', '最新批次'],
            datasets: [
                {
                    label: '剥离强度 (N/mm)',
                    data: [0.72, 0.76, 0.71, 0.78, 0.75, 0.82],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    yAxisID: 'y-peel',
                    tension: 0.3,
                    borderWidth: 2,
                    pointBackgroundColor: '#3b82f6'
                },
                {
                    label: '粗糙度 Rz (μm)',
                    data: [0.95, 0.88, 0.92, 0.82, 0.85, 0.78],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    yAxisID: 'y-rz',
                    tension: 0.3,
                    borderWidth: 2,
                    pointBackgroundColor: '#10b981'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { size: 9 } }
                },
                'y-peel': {
                    type: 'linear',
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { size: 9 } },
                    title: { display: true, text: '剥离强度 (N/mm)', color: '#3b82f6', font: { size: 9 } }
                },
                'y-rz': {
                    type: 'linear',
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#94a3b8', font: { size: 9 } },
                    title: { display: true, text: '粗糙度 Rz (μm)', color: '#10b981', font: { size: 9 } }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#94a3b8', font: { size: 9 } }
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
