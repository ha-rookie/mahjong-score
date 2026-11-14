/** WebAuthn NotAllowedError is ambiguous, and does not prove a user cancelled.
 * Never surface raw errors, credentials, invite or recovery tokens.
 */
export type GuestPasskeyMode="register"|"recover"|"login";
export type GuestPasskeyStage="support"|"options"|"device"|"verify"|"transition";

export const guestPasskeyFailureMessage=(
  mode:GuestPasskeyMode,stage:GuestPasskeyStage,error:unknown,
):string=>{
  const message=error instanceof Error?error.message:"";
  const name=error instanceof Error?error.name:"";
  const status=/^passkey_http_(\d{3})$/.exec(message)?.[1];
  if(stage==="support")return "このブラウザではパスキーを利用できません。Safariなどの対応ブラウザで開いてください。";
  if(stage==="device"){
    if(name==="NotAllowedError"||name==="AbortError")
      return "端末でパスキーの操作を完了できませんでした。キャンセル以外にも、Face ID・画面ロック・パスキーの保存先などで中断する場合があります。Safariで再試行してください。";
    if(name==="InvalidStateError")
      return "このアカウントのパスキーが端末にすでにある可能性があります。保存済みパスキーや登録状況を確認してください。";
    return "端末でパスキーの作成・認証に失敗しました。Safariや端末のパスキー設定を確認してください。";
  }
  if(stage==="options"){
    if(status==="429")return "登録準備へのアクセスが集中しています。少し時間をおいてお試しください。";
    if(status==="409"&&mode==="recover")
      return "復旧リンクが期限切れ・使用済み、または対象アカウントと一致しない可能性があります。新しい復旧リンクを確認してください。";
    if(status==="409"&&mode==="register")
      return "招待リンクが期限切れ・使用済み、または参加済みの可能性があります。新しい招待リンクを確認してください。";
    if(status==="409")return "ログイン準備を完了できませんでした。もう一度お試しください。";
    return "パスキーの登録・ログイン準備に失敗しました。通信状態を確認して再試行してください。";
  }
  if(stage==="verify"){
    if(mode==="recover")return "端末側の操作後、復旧登録をサーバーで完了できませんでした。復旧リンクの状態を確認してください。";
    if(mode==="register")return "端末側の操作後、招待登録をサーバーで完了できませんでした。招待リンクの状態を確認してください。";
    return "端末側の認証後、サーバーへのログインを完了できませんでした。もう一度お試しください。";
  }
  return "画面の切り替えが完了しませんでした。ページを開き直してください。";
};
