export const appliedProductionMigrations = Object.freeze({
  "0001_initial.sql": "f7e6fddf9d438709c0350dca8f67fc6eb82e8d5a",
  "0002_auth_foundation.sql": "63d3055ebb128c020f40767c39651f5d81d3780f",
  "0003_group_player_user_link.sql": "41e8a409b52fb4623fa62393715962b248fde6bf",
  "0004_system_group_roles.sql": "5f04e6b920be05255b5c3d3835577fe0d6c03d57",
  "0005_player_invitations.sql": "f3cca70f2c5d00b29c9946f04fc830abf064bbac",
  "0006_line_login_states.sql": "0d0adb422f002fe7343d9954ae01c942a85b84b2",
  "0007_single_active_session.sql": "19f69b72fa970b4fe4acdc2eecc87f290d8b92dd",
  "0008_configurable_mahjong_rules.sql": "4de66d2d305e51e881fcfe8c292319f69bb4283e",
  "0009_ios_pwa_auth_handoff.sql": "5f284359ff4cb2b92022f1c444fad135379699ea"
});

export const appliedProductionMigrationNames = Object.freeze(
  Object.keys(appliedProductionMigrations).sort(),
);

export const latestAppliedProductionMigrationNumber = 9;
