/**
 * Browser-only WebAuthn registration codec. No private key, PIN or biometric
 * data is accessed by the application: navigator.credentials talks directly to
 * the user's authenticator and returns attestation to be verified by the Worker.
 */
export type RegistrationOptionsEnvelope={
  flowId:string;
  options:unknown;
  expiresAt:string;
};
export const webauthnRegistrationSupported=():boolean=>
  typeof window!=="undefined" && window.isSecureContext &&
  typeof PublicKeyCredential!=="undefined" &&
  typeof PublicKeyCredential.parseCreationOptionsFromJSON==="function" &&
  typeof navigator.credentials?.create==="function";

export const getRegistrationAttestation=async (
  options:unknown,
  parse:(input:unknown)=>PublicKeyCredentialCreationOptions=(input)=>
    PublicKeyCredential.parseCreationOptionsFromJSON(input as Parameters<typeof PublicKeyCredential.parseCreationOptionsFromJSON>[0]),
  create:(opts:CredentialCreationOptions)=>Promise<Credential|null>=(opts)=>
    navigator.credentials.create(opts),
):Promise<unknown>=>{
  if(!options||typeof options!=="object"||Array.isArray(options))throw new Error("missing_options");
  const parsed=parse(options);
  if(!parsed?.challenge||!parsed?.rp?.id||!parsed?.user?.id)throw new Error("invalid_webauthn_options");
  const credential=await create({publicKey:parsed});
  if(!credential||credential.type!=="public-key"||!("toJSON" in credential)||
      typeof credential.toJSON!=="function")throw new Error("invalid_webauthn_credential");
  // Native toJSON() converts WebAuthn binary values to base64url JSON. The
  // server checks challenge, origin, RP ID, UV, signature and public key.
  return credential.toJSON();
};
