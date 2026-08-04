# Contract specification pack

One file per module, generated from `docs/api.json`. Contains contracts only —
no implementation. This is the sole input to the blind contract test suite.

| Module | Methods | Testable | Unreachable |
|---|---|---|---|
| [`mcp/acousim.js`](mcp_acousim_js.spec.md) | 30 | 10 | 20 |
| [`mcp/builders.js`](mcp_builders_js.spec.md) | 19 | 15 | 4 |
| [`mcp/http.js`](mcp_http_js.spec.md) | 3 | 0 | 3 |
| [`mcp/test-client.mjs`](mcp_test-client_mjs.spec.md) | 2 | 0 | 2 |
| [`mcp/test-http.mjs`](mcp_test-http_mjs.spec.md) | 2 | 0 | 2 |
| [`scripts/build-spec-pack.mjs`](scripts_build-spec-pack_mjs.spec.md) | 4 | 0 | 4 |
| [`scripts/contracts-lib.mjs`](scripts_contracts-lib_mjs.spec.md) | 16 | 13 | 3 |
| [`scripts/import-catalog.mjs`](scripts_import-catalog_mjs.spec.md) | 48 | 0 | 48 |
| [`scripts/triage-contracts.mjs`](scripts_triage-contracts_mjs.spec.md) | 3 | 0 | 3 |
| [`server/auth.js`](server_auth_js.spec.md) | 3 | 1 | 2 |
| [`server/index.js`](server_index_js.spec.md) | 4 | 0 | 4 |
| [`src/App.jsx`](src_App_jsx.spec.md) | 5 | 1 | 4 |
| [`src/components/DriverDB.jsx`](src_components_DriverDB_jsx.spec.md) | 7 | 2 | 5 |
| [`src/components/FlowCanvas.jsx`](src_components_FlowCanvas_jsx.spec.md) | 4 | 2 | 2 |
| [`src/components/MenuBar.jsx`](src_components_MenuBar_jsx.spec.md) | 31 | 1 | 30 |
| [`src/components/NLLab.jsx`](src_components_NLLab_jsx.spec.md) | 23 | 4 | 19 |
| [`src/components/OutputPanel.jsx`](src_components_OutputPanel_jsx.spec.md) | 35 | 7 | 28 |
| [`src/components/Palette.jsx`](src_components_Palette_jsx.spec.md) | 2 | 1 | 1 |
| [`src/components/ParamPanel.jsx`](src_components_ParamPanel_jsx.spec.md) | 14 | 2 | 12 |
| [`src/components/PopoutView.jsx`](src_components_PopoutView_jsx.spec.md) | 1 | 1 | 0 |
| [`src/components/ProjectManager.jsx`](src_components_ProjectManager_jsx.spec.md) | 6 | 1 | 5 |
| [`src/components/SettingsWindow.jsx`](src_components_SettingsWindow_jsx.spec.md) | 26 | 2 | 24 |
| [`src/components/TSCalc.jsx`](src_components_TSCalc_jsx.spec.md) | 6 | 4 | 2 |
| [`src/components/Toolbar.jsx`](src_components_Toolbar_jsx.spec.md) | 8 | 1 | 7 |
| [`src/components/VelocityPopup.jsx`](src_components_VelocityPopup_jsx.spec.md) | 1 | 1 | 0 |
| [`src/components/dock/DockLayout.jsx`](src_components_dock_DockLayout_jsx.spec.md) | 14 | 3 | 11 |
| [`src/components/dock/panels.jsx`](src_components_dock_panels_jsx.spec.md) | 1 | 0 | 1 |
| [`src/components/nodes.jsx`](src_components_nodes_jsx.spec.md) | 7 | 5 | 2 |
| [`src/data/driver-audit.js`](src_data_driver-audit_js.spec.md) | 3 | 1 | 2 |
| [`src/data/driver-fields.js`](src_data_driver-fields_js.spec.md) | 2 | 2 | 0 |
| [`src/data/drivers.js`](src_data_drivers_js.spec.md) | 1 | 0 | 1 |
| [`src/engine/acoustics.js`](src_engine_acoustics_js.spec.md) | 9 | 9 | 0 |
| [`src/engine/complex.js`](src_engine_complex_js.spec.md) | 18 | 18 | 0 |
| [`src/engine/geometry.js`](src_engine_geometry_js.spec.md) | 4 | 4 | 0 |
| [`src/engine/metrics.js`](src_engine_metrics_js.spec.md) | 4 | 2 | 2 |
| [`src/engine/nonlinear.js`](src_engine_nonlinear_js.spec.md) | 12 | 12 | 0 |
| [`src/engine/project.js`](src_engine_project_js.spec.md) | 1 | 1 | 0 |
| [`src/engine/solver.js`](src_engine_solver_js.spec.md) | 11 | 6 | 5 |
| [`src/keymap.js`](src_keymap_js.spec.md) | 29 | 29 | 0 |
| [`src/layout.js`](src_layout_js.spec.md) | 21 | 21 | 0 |
| [`src/panelMeta.js`](src_panelMeta_js.spec.md) | 1 | 1 | 0 |
| [`src/popout.js`](src_popout_js.spec.md) | 3 | 3 | 0 |
| [`src/store.js`](src_store_js.spec.md) | 77 | 74 | 3 |
| [`src/toolbarItems.js`](src_toolbarItems_js.spec.md) | 6 | 4 | 2 |
| [`src/utils/export.js`](src_utils_export_js.spec.md) | 7 | 5 | 2 |
| [`test/contracts.mjs`](test_contracts_mjs.spec.md) | 2 | 0 | 2 |
| [`test/drivers.mjs`](test_drivers_mjs.spec.md) | 2 | 0 | 2 |
| [`test/support/loader.mjs`](test_support_loader_mjs.spec.md) | 2 | 2 | 0 |
| **Total** | **540** | **271** | **269** |
