(function (root,factory) {
  'use strict';
  const api=factory();
  if (typeof module === 'object' && module.exports) module.exports=api;
  else root.HandballAiModels=api;
})(typeof window === 'object' ? window : globalThis,function () {
  'use strict';
  // Standard API prices per million tokens, checked against OpenAI Docs 2026-11-03.
  const models=Object.freeze([
    Object.freeze({id:'gpt-5.4-mini',name:'GPT-5.4 Mini',tier:'Günstig',input:0.75,output:4.5,reasoning:'none'}),
    Object.freeze({id:'gpt-5.6-sol',name:'GPT-5.6 Sol',tier:'Mittel',input:4,output:20,reasoning:'low'}),
    Object.freeze({id:'gpt-6-astra',name:'GPT-6 Astra',tier:'Premium',input:10,output:50,reasoning:'low'})
  ]);
  const defaultModel=models[0].id;
  const find=value => models.find(model => model.id === value);
  return {models,defaultModel,find};
});
