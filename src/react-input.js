/* Write to a React-controlled <input>. Directly assigning .value
 * is invisible to React; we must call the native setter and then
 * dispatch a bubbling 'input' event so React's synthetic event
 * system picks up the change. */
(function () {
  const nativeInputSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  ).set;

  /** Set `el.value` to `value` and notify React. No-op if unchanged. */
  function setValue(el, value) {
    if (!el) return;
    if (el.value === value) return;
    const setter =
      el instanceof HTMLTextAreaElement
        ? nativeTextareaSetter
        : nativeInputSetter;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Programmatically dispatch Enter so X submits the search. */
  function submitSearch(el) {
    if (!el) return;
    const init = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    };
    el.dispatchEvent(new KeyboardEvent('keydown', init));
    el.dispatchEvent(new KeyboardEvent('keypress', init));
    el.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  const NS = (window.XSF = window.XSF || {});
  NS.reactInput = { setValue, submitSearch };
})();
