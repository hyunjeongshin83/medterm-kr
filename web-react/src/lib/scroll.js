/** 카드(id)로 내려가 그 카드에 초점을 둔다.
    데스크톱·태블릿의 작업 탭 줄은 화면 위에 붙어 있으므로(sticky) 카드 제목이 그 밑에 가려지지 않게 그만큼 비켜서 멈춘다. 휴대폰은 탭 줄이 아래에 있어 0. */
export function scrollToCard(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  const bar = document.querySelector('[role="tablist"][aria-label="작업 화면"]');
  const cover = bar && getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight + 8 : 0;
  el.style.scrollMarginTop = `${cover}px`;
  el.scrollIntoView({ block: 'start' });
  el.focus({ preventScroll: true });
  return true;
}
