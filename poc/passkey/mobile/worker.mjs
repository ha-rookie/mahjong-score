// S0 ONLY: mobile WebAuthn browser capability page. NO DB, accounts, Secrets, user data or API.
import { script } from './client.mjs';
const page = "<!doctype html>\n<html lang=\"ja\"><head><meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>パスキー実機互換性テスト | S0</title>\n<style>:root{color-scheme:light dark;font-family:system-ui,sans-serif;line-height:1.65}body{margin:0;padding:1.2rem;max-width:44rem;margin-inline:auto}h1{font-size:1.5rem}section{border:1px solid #8886;border-radius:.7rem;padding:1.2rem;margin-block:1rem}button{padding:.8rem 1.2rem;margin:.2rem;border-radius:.5rem;font:inherit;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:.8rem;border-radius:.5rem;background:Canvas;color:CanvasText;border:1px solid #8888}small{opacity:.8}</style>\n</head><body><main>\n<h1>パスキー実機互換性テスト</h1>\n<p>三麻スコアの本番ログインではありません。データをサーバーへ送信せず、この端末でのパスキー作成・使用とRP ID（ドメイン）の整合を調べます。</p>\n<section><h2>実行環境</h2><pre id=\"environment\" aria-live=\"polite\">確認中</pre></section>\n<section><h2>テスト</h2><p>端末にこのテストサイト用のパスキーが登録されます。終了後は端末のパスキー管理から削除してください。</p>\n<button id=\"create\" type=\"button\">1. パスキーを作成</button><button id=\"get\" type=\"button\">2. パスキーを使用</button>\n<button id=\"clear\" type=\"button\">端末内のテスト記録だけを削除</button>\n<pre id=\"status\" role=\"status\" aria-live=\"polite\">開始前</pre>\n<small>「テスト記録だけを削除」ではOS側のパスキーは削除されません。</small></section>\n<section><h2>この検証で分からないこと</h2><p>サーバー側の本人認証、署名検証、セッション、招待の受諾、LINE連携は実行しません。</p></section>\n</main><script src=\"/client.js\" defer></script></body></html>";
const headers = {
  'cache-control':'no-store, max-age=0',
  'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'; object-src 'none'",
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'x-robots-tag':'noindex, nofollow, noarchive',
  'referrer-policy':'no-referrer',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), publickey-credentials-create=(self), publickey-credentials-get=(self)',
  'cross-origin-resource-policy':'same-origin',
};
export default {
  async fetch(req) {
    const u=new URL(req.url);
    if(req.method!=='GET' && req.method!=='HEAD')return new Response('method not allowed',{status:405,headers});
    if(u.pathname==='/')return new Response(req.method==='HEAD'?null:page,{headers:{...headers,'content-type':'text/html; charset=utf-8'}});
    if(u.pathname==='/client.js')return new Response(req.method==='HEAD'?null:script,{headers:{...headers,'content-type':'application/javascript; charset=utf-8'}});
    if(u.pathname==='/health')return Response.json({ok:true,purpose:'s0-mobile-readiness-only',noDatabase:true,noUserData:true},{headers});
    return new Response('not found',{status:404,headers});
  }
};
