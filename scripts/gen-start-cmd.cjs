// 重新生成 start-dsh.cmd：CRLF 换行 + 纯 ASCII + 启动前自动清理 3080 端口残留进程
const fs = require('fs');
const lines = [
  '@echo off',
  'REM Start DeepSeek Harness Web on port 3080 (auto-kills stale process first)',
  'REM NOTE: keep this file ASCII-only with CRLF line endings, or cmd.exe will misparse it.',
  'set DSH_HOME=C:\\Users\\58281\\.dsh',
  'for /f "tokens=5" %%p in (\'netstat -ano ^| findstr ":3080" ^| findstr "LISTENING"\') do taskkill /PID %%p /F >nul 2>&1',
  '"C:\\nvm4w\\nodejs\\node.exe" "D:\\deepseek-harness\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js" web',
  'pause',
];
fs.writeFileSync('D:/deepseek-harness/start-dsh.cmd', lines.join('\r\n') + '\r\n', 'ascii');
console.log('written, bytes =', fs.statSync('D:/deepseek-harness/start-dsh.cmd').size);
