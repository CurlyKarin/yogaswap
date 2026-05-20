"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TENANT_ID = void 0;
exports.getParticipantStatus = getParticipantStatus;
/** Standard-Tenant-ID bis Multi-Tenancy vollständig aktiv ist */
exports.DEFAULT_TENANT_ID = "default-tenant";
/**
 * Ableitung des Teilnehmer-Status aus Profilfeldern (ohne eigenes Status-Feld).
 */
function getParticipantStatus(profile) {
    const auth = profile.authUserId?.trim();
    const invitedFlag = profile.inviteSentAt?.trim();
    const done = profile.inviteCompletedAt?.trim();
    if (auth) {
        if (done)
            return "active";
        if (!invitedFlag)
            return "active";
        return "invited";
    }
    if (invitedFlag)
        return "invited";
    return "no_login";
}
