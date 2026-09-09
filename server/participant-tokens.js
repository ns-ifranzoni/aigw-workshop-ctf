/**
 * Shared lookup for a participant's AI Gateway token row.
 *
 * A participant can be linked to their api_keys row two ways depending on how
 * they were created (self-registration, bulk creation, or a manually imported
 * token pool): by assignment (api_keys.assigned_to === access_codes.code) or by
 * token value (api_keys.key === access_codes.api_key). Older installs also have
 * rows where assigned_to was cleared, so both paths are needed.
 *
 * Always prefer the stored netskope_token_group_name over rebuilding it from the
 * participant code: the code is uppercased while the token group is created with
 * the username as typed, and admins can pick a custom prefix on bulk creation.
 */
const db = require('./db');

function findParticipantTokenRow(code, apiKeyVal) {
  const v = apiKeyVal || '';
  return db.prepare(
    "SELECT * FROM api_keys WHERE assigned_to = ? OR (? != '' AND key = ?) LIMIT 1"
  ).get(code, v, v);
}

function participantTokenGroupName(code, apiKeyVal) {
  return findParticipantTokenRow(code, apiKeyVal)?.netskope_token_group_name || null;
}

function participantTokenGroupId(code, apiKeyVal) {
  return findParticipantTokenRow(code, apiKeyVal)?.netskope_token_group_id || null;
}

module.exports = { findParticipantTokenRow, participantTokenGroupName, participantTokenGroupId };
