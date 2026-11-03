// Classic scripts also run when index.html is opened as a local file.
// Load ES modules only from the loopback server.
if (location.protocol === 'file:') {
  document.getElementById('startup-help').hidden = false;
  document.querySelectorAll('button, input, select, textarea').forEach(el => el.disabled = true);
  document.getElementById('status').textContent = '프로그램 폴더의 start.cmd로 실행해 주세요.';
} else {
  import('./app.mjs').catch(() => {
    const help = document.getElementById('startup-help');
    help.hidden = false;
    help.querySelector('h2').textContent = '프로그램을 불러오지 못했습니다.';
    help.querySelector('p').textContent = 'ZIP을 모두 압축 해제했는지 확인한 다음 start.cmd로 다시 실행해 주세요.';
    document.getElementById('status').textContent = '프로그램 파일을 불러오지 못했습니다.';
  });
}
