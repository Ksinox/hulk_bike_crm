/* Халк Байк CRM mobile — общий рантайм: иконки, навигация, bottom-sheet */
(function (w) {
  /* ---- lucide-стиль иконки (только нужные) ---- */
  var P = {
    home:'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
    bike:'M5.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm13 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5.5 14.5 9 7h4l3 5.5M9 7l3.5 7.5M12.5 7H16',
    scooter:'M4 17a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Zm12.5 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM9 17h7.5M16.5 17 14 6h-3M14 6h4l2 4M6.5 14.5 9 17',
    users:'M16 19v-2a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v2M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm11 8v-2a3 3 0 0 0-2.2-2.9M15 4.2A3.5 3.5 0 0 1 15 11',
    inbox:'M21 12h-5l-2 3h-4l-2-3H3M3 12V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6m-18 0v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
    chevL:'M15 5l-7 7 7 7',
    chevR:'M9 5l7 7-7 7',
    chevD:'M5 9l7 7 7-7',
    plus:'M12 5v14M5 12h14',
    phone:'M6 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L17 14l5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2Z',
    search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.5-4.5',
    more:'M12 6h.01M12 12h.01M12 18h.01',
    bell:'M18 9a6 6 0 0 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M10.5 20a2 2 0 0 0 3 0',
    wrench:'M14.5 6a3.5 3.5 0 0 1-4.6 4.6L5 15.5a2.1 2.1 0 0 0 3 3l4.9-4.9A3.5 3.5 0 0 1 17.5 9l-2-1 0-2Z',
    alert:'M12 3 2 20h20L12 3ZM12 10v4M12 17h.01',
    check:'M5 12.5 10 17l9-10',
    checkc:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8.5 12l2.5 2.5L16 9',
    x:'M6 6l12 12M18 6 6 18',
    cal:'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
    clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
    wallet:'M3 7a2 2 0 0 1 2-2h12v3M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1Zm14 5h.01',
    cash:'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 9v.01M18 15v.01',
    shield:'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z',
    camera:'M4 8a2 2 0 0 1 2-2h2l1.5-2h5L18 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    pin:'M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    upR:'M7 17 17 7M9 7h8v8',
    filter:'M3 5h18l-7 8v6l-4-2v-4L3 5Z',
    edit:'M4 20h4L20 8l-4-4L4 16v4ZM14 6l4 4',
    file:'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5M9 13h6M9 17h6',
    refresh:'M21 12a9 9 0 1 1-3-6.7L21 8M21 4v4h-4',
    user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1',
    star:'M12 3l2.6 5.5 6 .8-4.3 4.2 1 6L12 16.8 6.7 19.5l1-6L3.4 9.3l6-.8L12 3Z',
    trend:'M3 17l6-6 4 4 8-8M15 7h6v6',
    pkg:'M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-13L3 8m9 5v8M3 8v8l9 5',
    logout:'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h12',
    settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.4l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.4-1.4L13.8 2h-3.6l-.4 2.3a7 7 0 0 0-2.4 1.4l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .5 0 .9.1 1.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.4 1.4l.4 2.3h3.6l.4-2.3a7 7 0 0 0 2.4-1.4l2.3 1 2-3.4-2-1.5c.1-.5.1-.9.1-1.4Z',
    scale:'M12 3v18M7 21h10M12 6 5 9m7-3 7 3M5 9l-2.5 5a3 3 0 0 0 5 0L5 9Zm14 0-2.5 5a3 3 0 0 0 5 0L19 9Z',
    map:'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
    sliders:'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5M14 4v4M6 10v4M11 16v4',
    arrowL:'M19 12H5M11 6l-6 6 6 6',
    sparkle:'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3ZM19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7L19 14Z',
    dollar:'M12 2v20M16 6.5C16 4.6 14.2 3.5 12 3.5S8 4.6 8 6.5 9.8 9.5 12 9.5s4 1.6 4 3.5-1.8 3-4 3-4-1.1-4-3'
  };
  function ic(name, cls){
    var d=P[name]||P.x;
    return '<svg class="ic '+(cls||'')+'" viewBox="0 0 24 24" aria-hidden="true"><path d="'+d+'"/></svg>';
  }
  w.ic = ic;

  /* ---- навигация: мост к родительской оболочке (index.html) ---- */
  var bridge = (w.parent && w.parent !== w && w.parent.HB) ? w.parent.HB : null;
  w.go = function (file) {
    if (bridge) bridge.go(file);
    else location.href = file;
  };
  w.back = function () {
    if (bridge) bridge.back();
    else history.back();
  };
  // показать кнопку «назад» только если есть куда возвращаться
  w.canBack = function(){ return bridge ? bridge.depth() > 0 : true; };

  /* ---- bottom-sheet helper ---- */
  w.sheet = function (html) {
    var wrap = document.getElementById('sheet');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'sheet'; wrap.className = 'sheet-wrap';
      document.body.appendChild(wrap);
    }
    wrap.innerHTML =
      '<div class="sheet-bg" onclick="closeSheet()"></div>' +
      '<div class="sheet"><div class="grip"></div>' + html + '</div>';
    wrap.classList.add('show');
  };
  w.closeSheet = function () {
    var wrap = document.getElementById('sheet');
    if (wrap) wrap.classList.remove('show');
  };

  /* ---- хедер: дорисовать кнопку назад если нужно ---- */
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.querySelector('[data-back]');
    if (b) {
      b.innerHTML = ic('chevL');
      b.addEventListener('click', w.back);
      if (!w.canBack()) b.style.visibility = 'hidden';
    }
    document.querySelectorAll('[data-ic]').forEach(function (el) {
      el.insertAdjacentHTML('afterbegin', ic(el.getAttribute('data-ic'),
        el.getAttribute('data-ic-cls') || ''));
    });
  });
})(window);
