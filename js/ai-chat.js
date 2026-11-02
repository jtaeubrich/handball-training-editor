(function (global) {
  'use strict';

  function normalizeEndpoint(value) {
    const url = new URL(value,location.href);
    const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
      throw new Error('Bitte eine HTTPS-Adresse des KI-Dienstes eingeben (lokal ist HTTP erlaubt).');
    }
    return url.href;
  }

  function createChat(deps) {
    const panel = document.getElementById('aiChat');
    const toggle = document.getElementById('aiChatToggle');
    const form = document.getElementById('aiChatForm');
    const prompt = document.getElementById('aiChatPrompt');
    const endpoint = document.getElementById('aiChatEndpoint');
    const access = document.getElementById('aiChatAccess');
    const settings = document.getElementById('aiChatSettings');
    const log = document.getElementById('aiChatLog');
    const status = document.getElementById('aiChatStatus');
    const send = document.getElementById('aiChatSend');
    const cancel = document.getElementById('aiChatCancel');
    const reset = document.getElementById('aiChatReset');
    const key = 'handballtrainer.aiEndpoint.v1';
    let messages = [], controller = null;
    try { endpoint.value = localStorage.getItem(key) || ''; } catch (_) { /* Optional preference. */ }
    if (!endpoint.value && ['localhost','127.0.0.1','[::1]'].includes(location.hostname)) endpoint.value = `${location.origin}/api/chat`;
    settings.open = !endpoint.value;

    function addMessage(who,text) {
      const row = document.createElement('div');
      row.className = `ai-chat-message ai-chat-${who}`;
      const title = document.createElement('strong');
      title.textContent = who === 'user' ? 'Du' : 'KI';
      const body = document.createElement('p'); body.textContent = text;
      row.append(title,body); log.append(row); log.parentElement.scrollTop = log.parentElement.scrollHeight;
    }
    function setBusy(value) {
      send.disabled = value; cancel.hidden = !value; reset.disabled = value;
      form.setAttribute('aria-busy',String(value));
      endpoint.disabled = value; access.disabled = value;
    }
    function open() {
      deps.onOpen?.();
      panel.hidden = false; toggle.hidden = true; toggle.setAttribute('aria-expanded','true');
      prompt.focus();
    }
    function close() {
      panel.hidden = true; toggle.hidden = false; toggle.setAttribute('aria-expanded','false'); toggle.focus();
    }
    toggle.addEventListener('click',open);
    document.getElementById('aiChatClose').addEventListener('click',close);
    panel.addEventListener('keydown',e => {
      // The editor's global shortcuts must not undo a sketch while editing chat text.
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    prompt.addEventListener('keydown',e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
    });
    cancel.addEventListener('click',() => controller?.abort());
    reset.addEventListener('click',() => {
      messages = []; log.replaceChildren(); status.textContent = 'Neuer Chat. Deine Skizze bleibt erhalten.';
    });
    form.addEventListener('submit',async e => {
      e.preventDefault();
      if (controller) return;
      let timer;
      let submittedText = '';
      try {
        const text = prompt.value.trim();
        if (!text) return;
        if (text.length > 4000) throw new Error('Bitte die Nachricht auf 4.000 Zeichen kürzen.');
        if (!endpoint.value.trim()) { settings.open = true; throw new Error('Bitte zuerst die Adresse des KI-Dienstes eintragen.'); }
        const address = normalizeEndpoint(endpoint.value.trim());
        if (deps.isBusy()) throw new Error('Bitte zuerst den laufenden Zeichen- oder Bearbeitungsschritt abschließen.');
        const snapshot = deps.capture();
        try { localStorage.setItem(key,address); } catch (_) { /* Request still works. */ }
        const conversation = [...messages,{role:'user',content:text}].slice(-12);
        submittedText = text;
        controller = new AbortController(); setBusy(true);
        let timedOut = false;
        timer = setTimeout(() => { timedOut = true; controller?.abort(); },60000);
        addMessage('user',text); prompt.value = '';
        status.textContent = 'KI bearbeitet deine Nachricht …';
        let response;
        try {
          response = await fetch(address,{
            method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
            headers:{'Content-Type':'application/json',...(access.value ? {Authorization:`Bearer ${access.value}`} : {})},
            body:JSON.stringify({messages:conversation,scene:snapshot.scene}),signal:controller.signal
          });
        } catch (error) {
          if (error.name === 'AbortError') throw new Error(timedOut ? 'Der KI-Dienst hat zu lange gebraucht. Die Skizze bleibt unverändert.' : 'Anfrage abgebrochen. Die Skizze bleibt unverändert.');
          throw new Error('KI-Dienst nicht erreichbar. Bitte Adresse und Verbindung prüfen.');
        }
        if (!response.ok) {
          const errors = {401:'Der Zugangscode ist ungültig.',403:'Dieser Editor ist beim KI-Dienst nicht freigeschaltet.',429:'Zu viele Anfragen. Bitte kurz warten.',503:'Der KI-Dienst ist noch nicht eingerichtet.',504:'Der KI-Dienst hat zu lange gebraucht.'};
          throw new Error(errors[response.status] || 'Der KI-Dienst konnte die Anfrage nicht bearbeiten.');
        }
        const raw = await response.text();
        if (raw.length > 100000) throw new Error('Die KI-Antwort ist zu groß. Bitte eine kleinere Änderung anfordern.');
        const reply = global.HandballAiCommands.validateReply(JSON.parse(raw),snapshot.scene);
        if (reply.commands.length) {
          if (deps.isBusy() || deps.signature() !== snapshot.signature) throw new Error('Die Skizze wurde inzwischen verändert. Bitte die Anweisung erneut senden; die KI-Änderungen wurden nicht übernommen.');
          deps.apply(snapshot,reply);
        }
        addMessage('assistant',reply.message);
        messages = [...conversation,{role:'assistant',content:reply.message}].slice(-12);
        status.textContent = reply.commands.length ? 'Skizze aktualisiert. Mit Rückgängig kannst du den KI-Schritt zurücknehmen.' : 'Die KI hat geantwortet. Die Skizze bleibt unverändert.';
      } catch (error) {
        if (submittedText && !prompt.value) prompt.value = submittedText;
        status.textContent = error instanceof SyntaxError ? 'Der KI-Dienst hat eine ungültige Antwort geliefert. Die Skizze bleibt unverändert.' : error.message;
      } finally {
        clearTimeout(timer); controller = null; setBusy(false);
      }
    });
    return {open,close};
  }

  global.HandballAiChat = {createChat,normalizeEndpoint};
})(window);
