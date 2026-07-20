# 聚赫新材 PLM 项目开发代理行为守则 (Workspace Agent Rules)

## 1. 浏览器测试约束 (Browser Testing Constraint)
- 除非用户在请求中明确指出（例如提到“在浏览器中测试”或“打开网页”等），否则**绝对不要使用浏览器子代理 (browser_subagent)** 进行网页自动测试或截图验证。
- Never test with the browser unless explicitly requested by the user.

## 2. 变更自动提交 (Auto-Commit Rule)
- 在完成对文件或代码的任意修改之后，**必须自动运行 Git commit 提交改动**，确保所有代码变更都有历史版本记录。
- Automatically commit all code modifications to Git after every change.
