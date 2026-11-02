import {isIP} from 'node:net';
import {SaxesParser} from 'saxes';
import {contentItem,botContentError} from './contentCatalog.js';

export const escapeBotHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function validateContentUrl(value){
  let url;try{url=new URL(value);}catch{throw botContentError('Enter a valid HTTPS URL');}
  if(url.protocol!=='https:'||url.username||url.password||/[\s\x00-\x1f\x7f{}]/.test(value)||isIP(url.hostname.replace(/^\[|\]$/g,''))||
    url.hostname==='localhost'||!url.hostname.includes('.'))throw botContentError('Only public HTTPS URLs without credentials are allowed');
  return value;
}
export function validateBotHtml(text){
  const parser=new SaxesParser({fragment:true});const stack=[];
  parser.on('error',()=>{throw botContentError('Invalid or unbalanced Telegram HTML');});
  parser.on('doctype',()=>{throw botContentError('Unsupported markup');});
  parser.on('processinginstruction',()=>{throw botContentError('Unsupported markup');});
  parser.on('comment',()=>{throw botContentError('Comments are not supported');});
  parser.on('cdata',()=>{throw botContentError('CDATA is not supported');});
  parser.on('opentag',tag=>{
    const names=Object.keys(tag.attributes);
    if(!['b','i','u','s','code','pre','a','tg-emoji'].includes(tag.name)||tag.isSelfClosing||
      stack.some(name=>['code','pre','tg-emoji'].includes(name))||
      (['code','pre','a','tg-emoji'].includes(tag.name)&&stack.length>0))throw botContentError('Unsupported Telegram HTML nesting');
    if(tag.name==='a'){
      if(names.length!==1||names[0]!=='href')throw botContentError('Links require only an HTTPS href');
      validateContentUrl(tag.attributes.href);
    }else if(tag.name==='tg-emoji'){
      if(names.length!==1||names[0]!=='emoji-id'||!/^\d{1,25}$/.test(tag.attributes['emoji-id']))throw botContentError('Invalid Telegram emoji');
    }else if(names.length)throw botContentError('Attributes are not allowed');
    stack.push(tag.name);
  });
  parser.on('closetag',()=>stack.pop());
  parser.write(text).close();
}
export function validateBotContent(key,text){
  const item=contentItem(key);
  if(typeof text!=='string'||(!text.trim()&&!item.optional)||text.length>item.max_length||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))
    throw botContentError(`Text is required and must be at most ${item.max_length} characters`);
  const allowed=new Set(item.placeholders);
  const stripped=text.replace(/\{([a-z_]+)\}/g,(_,name)=>{if(!allowed.has(name))throw botContentError(`Unknown placeholder: {${name}}`);return '';});
  if(/[{}]/.test(stripped))throw botContentError('Invalid placeholder syntax');
  if(item.kind==='url'){if(text)validateContentUrl(text);}
  else if(item.plain_text){if(/[<>]/.test(text))throw botContentError('Callback alerts must be plain text');}
  else if(item.kind==='message')validateBotHtml(text);
  else if(/[<>\r\n]/.test(text))throw botContentError('Labels must be plain single-line text');
  return text;
}
export function renderBotContent(key,text,values={},trusted=new Set()){
  const item=contentItem(key);validateBotContent(key,text);
  const rendered=text.replace(/\{([a-z_]+)\}/g,(_,name)=>{
    const value=String(values[name]??'');
    return item.kind==='message'&&!trusted.has(name)?escapeBotHtml(value):value;
  });
  if(rendered.length>(item.kind==='button'?64:item.kind==='command'?256:4096))throw botContentError('Rendered content exceeds Telegram limits');
  if(item.kind==='message')validateBotHtml(rendered);
  else if(item.kind!=='url'&&/[<>\r\n]/.test(rendered))throw botContentError('Rendered label must be plain text');
  return rendered;
}
