import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteParticipant,
  getParticipants,
  inviteUser,
  resetParticipantPassword,
  updateParticipant,
  type ParticipantWithStatus,
} from "../api/participants";
import type { Tenant, UserRole } from "shared/types";
import { NICKNAME_MIN_LENGTH, validateNickname } from "shared/nickname";
import {
  suggestNicknameFromDisplayName,
  validateDisplayName,
} from "shared/displayName";
import { getStatusPresentation, participantDisplayName } from "../lib/participants";
import { focusModalOnOpen } from "../lib/focusWithVisibleRing";
import StudioSettingsSection from "./StudioSettingsSection";
import TermDateSelect from "./TermDateSelect";

const ROLE_LABELS_DE: Record<UserRole, string> = {
  admin: "Admin",
  instructor: "Kursleitung",
  participant: "Teilnehmerin",
};
const ROLE_OPTIONS: UserRole[] = ["participant", "instructor", "admin"];

function getRoleLabel(role: UserRole | undefined): string {
  if (!role) return "-";
  return ROLE_LABELS_DE[role] ?? role;
}

type AdminPanelProps = {
  canEditRoles?: boolean;
  tenant?: Tenant | null;
  onTenantUpdated?: (tenant: Tenant) => void;
};
type CreateNicknameCheckState =
  | "idle"
  | "too_short"
  | "invalid"
  | "new"
  | "reactivation"
  | "active_conflict"
  | "exists_in_tenant";

export default function AdminPanel({
  canEditRoles = false,
  tenant = null,
  onTenantUpdated,
}: AdminPanelProps) {
  const [participants, setParticipants] = useState<ParticipantWithStatus[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState("");
  const [participantsSearch, setParticipantsSearch] = useState("");

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState("");
  const [editingDisplayName, setEditingDisplayName] = useState("");
  const [editingRole, setEditingRole] = useState<UserRole>("participant");
  const [editingForcePasswordResetOnEmailChange, setEditingForcePasswordResetOnEmailChange] =
    useState(false);
  const [editingSaving, setEditingSaving] = useState(false);
  const [editingError, setEditingError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createNickname, setCreateNickname] = useState("");
  const [createNicknameManual, setCreateNicknameManual] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<"participant" | "instructor" | "admin">(
    "participant",
  );
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createEmailAutoFilled, setCreateEmailAutoFilled] = useState(false);
  const [createOverwriteEmailOnReactivate, setCreateOverwriteEmailOnReactivate] = useState(false);
  const [createReactivationCheckboxFocused, setCreateReactivationCheckboxFocused] = useState(false);
  const [createReactivationUserId, setCreateReactivationUserId] = useState<string | null>(null);
  const [createNicknameCheckState, setCreateNicknameCheckState] =
    useState<CreateNicknameCheckState>("idle");
  const [createMatchedParticipant, setCreateMatchedParticipant] =
    useState<ParticipantWithStatus | null>(null);
  const [createLastResolvedNickname, setCreateLastResolvedNickname] = useState<string | null>(null);

  const [inviteSendingByUserId, setInviteSendingByUserId] = useState<Record<string, boolean>>(
    {},
  );
  const [inviteResultByUserId, setInviteResultByUserId] = useState<Record<string, string>>({});
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<Record<string, boolean>>(
    {},
  );
  const [bulkInviteSending, setBulkInviteSending] = useState(false);
  const [bulkInviteResult, setBulkInviteResult] = useState("");
  const [deleteRunningByUserId, setDeleteRunningByUserId] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<ParticipantWithStatus | null>(null);
  const editingModalRef = useRef<HTMLDivElement | null>(null);
  const createModalRef = useRef<HTMLDivElement | null>(null);
  const deleteModalRef = useRef<HTMLDivElement | null>(null);
  const createDisplayNameInputRef = useRef<HTMLInputElement | null>(null);
  const createNicknameInputRef = useRef<HTMLInputElement | null>(null);
  const createEmailInputRef = useRef<HTMLInputElement | null>(null);
  const createRoleSelectRef = useRef<HTMLButtonElement | null>(null);
  const createCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const createReactivationCheckboxRef = useRef<HTMLInputElement | null>(null);

  const refreshParticipants = async () => {
    setParticipantsLoading(true);
    setParticipantsError("");
    try {
      const searchValue = participantsSearch.trim();
      const list = await getParticipants(
        searchValue
          ? {
              search: searchValue,
            }
          : undefined,
      );
      const safeList = Array.isArray(list) ? list : [];
      setParticipants(safeList);
    } catch (err) {
      console.error("Failed to load participants", err);
      setParticipantsError("Konnte Teilnehmer nicht laden.");
    } finally {
      setParticipantsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadParticipants() {
      setParticipantsLoading(true);
      setParticipantsError("");
      try {
        const searchValue = participantsSearch.trim();
        const list = await getParticipants(
          searchValue
            ? {
                search: searchValue,
              }
            : undefined,
        );
        if (cancelled) return;
        const safeList = Array.isArray(list) ? list : [];
        setParticipants(safeList);
      } catch (err) {
        console.error("Failed to load participants", err);
        if (!cancelled) {
          setParticipantsError("Konnte Teilnehmer nicht laden.");
        }
      }

      if (!cancelled) {
        setParticipantsLoading(false);
      }
    }

    loadParticipants();
    return () => {
      cancelled = true;
    };
  }, [participantsSearch]);

  const safeParticipants = useMemo(
    () => (Array.isArray(participants) ? participants : []),
    [participants],
  );
  const getKnownParticipantByNickname = useCallback(
    (nicknameValue: string): ParticipantWithStatus | undefined => {
      const normalized = nicknameValue.trim().toLowerCase();
      if (!normalized) return undefined;
      return safeParticipants.find((p) => (p.userId || "").trim().toLowerCase() === normalized);
    },
    [safeParticipants],
  );
  const takenNicknamesNormalized = useMemo(
    () => safeParticipants.map((p) => (p.userId || "").trim().toLowerCase()).filter(Boolean),
    [safeParticipants],
  );
  const createActiveConflict = createNicknameCheckState === "active_conflict";
  const createSuggestedNickname = useMemo(() => {
    if (!createActiveConflict) return "";
    const base = createNickname.trim();
    if (!base) return "";
    const used = new Set(takenNicknamesNormalized);
    let idx = 1;
    let candidate = `${base}${idx}`;
    while (used.has(candidate.toLowerCase()) && idx < 1000) {
      idx += 1;
      candidate = `${base}${idx}`;
    }
    return candidate;
  }, [createActiveConflict, createNickname, takenNicknamesNormalized]);
  const resolveCreateNicknameContext = useCallback(async (nicknameValue: string) => {
    const formatCheck = validateNickname(nicknameValue);
    if (!formatCheck.ok) {
      setCreateReactivationUserId(null);
      setCreateOverwriteEmailOnReactivate(false);
      setCreateMatchedParticipant(null);
      setCreateLastResolvedNickname(null);
      if (formatCheck.code === "empty") {
        setCreateNicknameCheckState("idle");
        return { state: "idle" as const, match: null as ParticipantWithStatus | null };
      }
      if (formatCheck.code === "too_short") {
        setCreateNicknameCheckState("too_short");
        return { state: "too_short" as const, match: null as ParticipantWithStatus | null };
      }
      setCreateNicknameCheckState("invalid");
      setCreateError(formatCheck.message);
      return { state: "invalid" as const, match: null as ParticipantWithStatus | null };
    }
    const normalized = formatCheck.nickname.toLowerCase();
    setCreateError("");
    if (normalized === createLastResolvedNickname && createNicknameCheckState !== "idle") {
      return {
        state: createNicknameCheckState,
        match: createMatchedParticipant,
      } as const;
    }

    const applyMatch = (match: ParticipantWithStatus) => {
      setCreateMatchedParticipant(match);
      setCreateDisplayName((prev) => (prev.trim() ? prev : match.displayName ?? prev));
      const hasTenantMembership = !!match.role;
      if (hasTenantMembership && match.status === "active") {
        setCreateNicknameCheckState("active_conflict");
        setCreateReactivationUserId(null);
        setCreateOverwriteEmailOnReactivate(false);
        setCreateEmail("");
        setCreateEmailAutoFilled(false);
        return;
      }
      if (hasTenantMembership) {
        setCreateNicknameCheckState("exists_in_tenant");
        setCreateReactivationUserId(null);
        setCreateOverwriteEmailOnReactivate(false);
        setCreateEmail(match.email ?? "");
        setCreateEmailAutoFilled(!!match.email);
        return;
      }
      setCreateNicknameCheckState("reactivation");
      setCreateReactivationUserId(match.userId);
      setCreateOverwriteEmailOnReactivate(false);
      setCreateEmail(match.email ?? "");
      setCreateEmailAutoFilled(!!match.email);
    };
    const applyNew = () => {
      setCreateNicknameCheckState("new");
      setCreateMatchedParticipant(null);
      setCreateReactivationUserId(null);
      setCreateOverwriteEmailOnReactivate(false);
      setCreateEmailAutoFilled(false);
    };

    const localMatch = getKnownParticipantByNickname(normalized);
    if (localMatch) {
      applyMatch(localMatch);
      setCreateLastResolvedNickname(normalized);
      const hasTenantMembership = !!localMatch.role;
      if (hasTenantMembership && localMatch.status === "active") {
        return { state: "active_conflict" as const, match: localMatch };
      }
      if (hasTenantMembership) {
        return { state: "exists_in_tenant" as const, match: localMatch };
      }
      return { state: "reactivation" as const, match: localMatch };
    }

    try {
      const remoteList = await getParticipants({ search: normalized, includeOrphaned: true });
      const remoteMatch = remoteList.find(
        (p) => (p.userId || "").trim().toLowerCase() === normalized,
      );
      if (remoteMatch) {
        applyMatch(remoteMatch);
        setCreateLastResolvedNickname(normalized);
        const hasTenantMembership = !!remoteMatch.role;
        if (hasTenantMembership && remoteMatch.status === "active") {
          return { state: "active_conflict" as const, match: remoteMatch };
        }
        if (hasTenantMembership) {
          return { state: "exists_in_tenant" as const, match: remoteMatch };
        }
        return { state: "reactivation" as const, match: remoteMatch };
      }
      applyNew();
      setCreateLastResolvedNickname(normalized);
      return { state: "new" as const, match: null as ParticipantWithStatus | null };
    } catch {
      applyNew();
      setCreateLastResolvedNickname(normalized);
      return { state: "new" as const, match: null as ParticipantWithStatus | null };
    }
  }, [createLastResolvedNickname, createMatchedParticipant, createNicknameCheckState, getKnownParticipantByNickname]);
  const canTrainerManageTarget = useCallback(
    (p: ParticipantWithStatus) => p.role === "participant",
    [],
  );
  const getFocusableElements = useCallback(
    (container: HTMLElement): HTMLElement[] =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ),
    [],
  );
  const focusFirstInModal = useCallback(
    (modalEl: HTMLDivElement | null) => {
      if (!modalEl) return;
      focusModalOnOpen(modalEl, { preferInput: true });
    },
    [],
  );
  const shouldHandleModalEnter = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter") return false;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    const tag = target.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return false;
    if ((target as HTMLInputElement).type === "checkbox") return false;
    return true;
  };
  const shouldHandleModalEscape = (event: React.KeyboardEvent<HTMLElement>) => event.key === "Escape";
  const isInviteEligible = useCallback(
    (p: ParticipantWithStatus) =>
      !!p.email &&
      p.status !== "active" &&
      (canEditRoles || canTrainerManageTarget(p)),
    [canEditRoles, canTrainerManageTarget],
  );
  const inviteEligibleUserIds = useMemo(
    () => safeParticipants.filter(isInviteEligible).map((p) => p.userId),
    [safeParticipants, isInviteEligible],
  );
  const selectedEligibleUserIds = inviteEligibleUserIds.filter((id) => !!selectedInviteUserIds[id]);
  const allEligibleSelected =
    inviteEligibleUserIds.length > 0 && selectedEligibleUserIds.length === inviteEligibleUserIds.length;

  useEffect(() => {
    // Selections sauber halten (z.B. nach Search/Refresh).
    setSelectedInviteUserIds((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of inviteEligibleUserIds) {
        if (prev[id]) next[id] = true;
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && prevKeys.every((k) => prev[k] === next[k])) {
        return prev;
      }
      return next;
    });
  }, [inviteEligibleUserIds]);

  const startEditEmail = (p: ParticipantWithStatus) => {
    setEditingUserId(p.userId);
    setEditingEmail(p.email ?? "");
    setEditingDisplayName(p.displayName ?? "");
    setEditingRole(p.role ?? "participant");
    setEditingForcePasswordResetOnEmailChange(false);
    setEditingError("");
    setEditingSaving(false);
  };
  const canEditEmailForParticipant = (p: ParticipantWithStatus): boolean =>
    canEditRoles ||
    (
      canTrainerManageTarget(p) &&
      p.status !== "active" &&
      !p.authUserId &&
      !p.inviteCompletedAt
    );

  const saveEditEmail = async () => {
    if (!editingUserId) return;
    setEditingSaving(true);
    setEditingError("");
    try {
      const trimmed = editingEmail.trim();
      const isValidEmailOrEmpty =
        trimmed.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      if (!isValidEmailOrEmpty) {
        setEditingError("Bitte eine gültige E-Mail-Adresse eingeben (oder leer lassen).");
        return;
      }
      const nextEmail = trimmed.length > 0 ? trimmed : null;
      const original = safeParticipants.find((p) => p.userId === editingUserId);
      const originalEmail = (original?.email ?? "").trim();
      const nextEmailText = (nextEmail ?? "").trim();
      const emailChanged = originalEmail.toLowerCase() !== nextEmailText.toLowerCase();
      const originalDisplayName = (original?.displayName ?? "").trim();
      let nextDisplayName: string | null | undefined;
      let displayNameChanged = false;
      if (editingDisplayName.trim()) {
        const displayNameCheck = validateDisplayName(editingDisplayName);
        if (!displayNameCheck.ok) {
          setEditingError(displayNameCheck.message);
          return;
        }
        nextDisplayName = displayNameCheck.displayName;
        displayNameChanged = originalDisplayName !== nextDisplayName;
      } else if (originalDisplayName) {
        nextDisplayName = null;
        displayNameChanged = true;
      }
      if (!canEditRoles && original?.status === "active" && emailChanged) {
        setEditingError("E-Mail von registrierten Teilnehmern kann nur von Admins geändert werden.");
        return;
      }
      const shouldForcePasswordReset =
        original?.status === "active" &&
        editingForcePasswordResetOnEmailChange &&
        nextEmailText.length > 0;

      await updateParticipant(
        editingUserId,
        canEditRoles
          ? {
              email: nextEmail,
              ...(displayNameChanged ? { displayName: nextDisplayName ?? null } : {}),
              role: editingRole,
            }
          : {
              email: nextEmail,
              ...(displayNameChanged ? { displayName: nextDisplayName ?? null } : {}),
            },
      );

      // Lokales Update reicht für diesen Zwischen-Use-Case.
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === editingUserId
            ? {
                ...p,
                email: nextEmail ?? undefined,
                ...(displayNameChanged
                  ? { displayName: nextDisplayName ?? undefined }
                  : {}),
                role: canEditRoles ? editingRole : p.role,
              }
            : p,
        ),
      );

      setEditingUserId(null);
      const roleChanged = canEditRoles && original?.role !== editingRole;
      const wasInvited = original?.status === "invited";
      if (shouldForcePasswordReset) {
        setBulkInviteResult("Änderungen gespeichert. Passwort-Reset wird gesendet.");
      } else if (emailChanged && original?.status === "active") {
        setBulkInviteResult(
          "E-Mail aktualisiert. Info-Mail wurde an die neue Adresse gesendet.",
        );
      } else if (wasInvited) {
        setBulkInviteResult("Änderungen gespeichert. Einladung wird erneut gesendet.");
      } else if (roleChanged && original?.status === "active") {
        setBulkInviteResult("Rolle aktualisiert. Nutzer wurde über die Änderung informiert.");
      } else if (roleChanged) {
        setBulkInviteResult("Rolle aktualisiert.");
      } else if (displayNameChanged) {
        setBulkInviteResult("Spitzname aktualisiert.");
      }
      if (canEditRoles && original?.status === "active" && nextEmailText.length > 0) {
        const effectiveParticipant: ParticipantWithStatus = {
          ...original,
          email: nextEmailText,
          role: canEditRoles ? editingRole : original.role,
        };
        if (editingForcePasswordResetOnEmailChange) {
          const resetResult = await sendPasswordResetForParticipant(effectiveParticipant, {
            refreshAfter: false,
          });
          if (resetResult?.ok && resetResult.emailSent) {
            setBulkInviteResult("Änderungen gespeichert. Passwort-Reset-Mail wurde gesendet.");
          } else if (resetResult?.ok && !resetResult.emailSent) {
            setBulkInviteResult(
              "Änderungen gespeichert. Passwort-Reset angestoßen, aber E-Mail konnte nicht versendet werden.",
            );
          } else {
            setBulkInviteResult(
              "Änderungen gespeichert, aber Passwort-Reset konnte nicht gestartet werden.",
            );
          }
        }
      }
      if (wasInvited && nextEmailText.length > 0) {
        const effectiveParticipant: ParticipantWithStatus = {
          ...original,
          email: nextEmailText,
          role: canEditRoles ? editingRole : original.role,
          status: "invited",
        };
        await sendInviteForParticipant(effectiveParticipant, { refreshAfter: false });
      }
    } catch (err) {
      console.error("Failed to update participant email", err);
      setEditingError("E-Mail konnte nicht gespeichert werden.");
    } finally {
      setEditingSaving(false);
    }
  };

  const editingOriginal = editingUserId
    ? safeParticipants.find((p) => p.userId === editingUserId)
    : undefined;
  const editingEmailTrimmed = editingEmail.trim();
  const editingOriginalEmail = (editingOriginal?.email ?? "").trim();
  const editingEmailChanged = editingEmailTrimmed.toLowerCase() !== editingOriginalEmail.toLowerCase();
  const editingDisplayNameTrimmed = editingDisplayName.trim();
  const editingOriginalDisplayName = (editingOriginal?.displayName ?? "").trim();
  const editingDisplayNameChanged = editingDisplayNameTrimmed !== editingOriginalDisplayName;
  const editingRoleChanged = !!(canEditRoles && editingOriginal && editingOriginal.role !== editingRole);
  const editingCanSendReset = !!(canEditRoles && editingOriginal?.status === "active");
  const editingSendsInvite = editingOriginal?.status === "invited";
  const editingHasChanges =
    editingEmailChanged ||
    editingDisplayNameChanged ||
    editingRoleChanged ||
    (editingCanSendReset && editingForcePasswordResetOnEmailChange);
  const createIsReactivation = createNicknameCheckState === "reactivation";
  const createCanUnlockReactivationEmail = canEditRoles && createIsReactivation;
  const createEmailEditable =
    createNicknameCheckState === "new" ||
    (createCanUnlockReactivationEmail && createOverwriteEmailOnReactivate);
  const deleteTargetHasLoginHistory = !!(
    deleteTarget &&
    (deleteTarget.authUserId || deleteTarget.inviteCompletedAt || deleteTarget.status === "active")
  );
  const resetCreateNicknameResolution = () => {
    setCreateNicknameCheckState("idle");
    setCreateMatchedParticipant(null);
    setCreateReactivationUserId(null);
    setCreateOverwriteEmailOnReactivate(false);
    setCreateReactivationCheckboxFocused(false);
    setCreateEmail("");
    setCreateEmailAutoFilled(false);
    setCreateLastResolvedNickname(null);
  };

  const syncNicknameFromDisplayName = (displayNameValue: string, force = false) => {
    if (!force && createNicknameManual) return;
    const suggestion = suggestNicknameFromDisplayName(displayNameValue, {
      takenNormalized: takenNicknamesNormalized,
    });
    setCreateNickname(suggestion);
    resetCreateNicknameResolution();
  };

  const openCreate = () => {
    setCreateOpen(true);
    setCreateDisplayName("");
    setCreateNickname("");
    setCreateNicknameManual(false);
    setCreateEmail("");
    setCreateEmailAutoFilled(false);
    setCreateRole("participant");
    setCreateError("");
    setCreateSaving(false);
    setCreateOverwriteEmailOnReactivate(false);
    setCreateReactivationUserId(null);
    setCreateReactivationCheckboxFocused(false);
    setCreateNicknameCheckState("idle");
    setCreateMatchedParticipant(null);
    setCreateLastResolvedNickname(null);
  };
  useEffect(() => {
    if (editingUserId) {
      queueMicrotask(() => focusFirstInModal(editingModalRef.current));
    }
  }, [editingUserId, focusFirstInModal]);
  useEffect(() => {
    if (createOpen) {
      queueMicrotask(() => focusFirstInModal(createModalRef.current));
    }
  }, [createOpen, focusFirstInModal]);
  useEffect(() => {
    if (deleteTarget) {
      queueMicrotask(() => focusFirstInModal(deleteModalRef.current));
    }
  }, [deleteTarget, focusFirstInModal]);
  useEffect(() => {
    const anyModalOpen = !!editingUserId || createOpen || !!deleteTarget;
    if (!anyModalOpen) return;

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        target === createNicknameInputRef.current &&
        !event.shiftKey &&
        !createEmailEditable
      ) {
        // Let the nickname field handler run first so it can resolve
        // the nickname and send focus to the proper next control.
        return;
      }
      const activeModal =
        (editingUserId && editingModalRef.current) ||
        (createOpen && createModalRef.current) ||
        (deleteTarget && deleteModalRef.current) ||
        null;
      if (!activeModal) return;

      const focusable = getFocusableElements(activeModal);
      if (focusable.length === 0) {
        event.preventDefault();
        activeModal.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const isInsideModal = !!active && activeModal.contains(active);
      const activeIndex = isInsideModal ? focusable.indexOf(active as HTMLElement) : -1;

      // Safari can jump to the browser chrome on Tab. We fully control
      // focus movement while a modal is open to keep focus trapped.
      event.preventDefault();

      if (!isInsideModal || activeIndex < 0) {
        if (event.shiftKey) {
          last.focus();
        } else {
          first.focus();
        }
        return;
      }

      if (event.shiftKey) {
        const prevIndex = activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1;
        focusable[prevIndex].focus();
        return;
      }
      const nextIndex = activeIndex >= focusable.length - 1 ? 0 : activeIndex + 1;
      focusable[nextIndex].focus();
    };

    document.addEventListener("keydown", onDocumentKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown, true);
    };
  }, [editingUserId, createOpen, deleteTarget, getFocusableElements, createEmailEditable]);
  useEffect(() => {
    if (!createOpen) return;
    if (createNicknameCheckState !== "new") return;
    if (document.activeElement !== createNicknameInputRef.current) return;
    setTimeout(() => {
      createEmailInputRef.current?.focus();
    }, 0);
  }, [createOpen, createNicknameCheckState]);
  const handleCreateNicknameKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Tab" || event.shiftKey) return;
    if (createEmailEditable || createSaving) return;
    const nicknameValue = createNickname.trim();
    if (nicknameValue.length < 3) return;

    event.preventDefault();
    const resolved = await resolveCreateNicknameContext(nicknameValue);
    if (resolved.state === "new") {
      const focusEmailWhenEnabled = (attempt = 0) => {
        const emailEl = createEmailInputRef.current;
        if (!emailEl) return;
        if (!emailEl.disabled) {
          emailEl.focus();
          return;
        }
        if (attempt >= 6) return;
        setTimeout(() => focusEmailWhenEnabled(attempt + 1), 0);
      };
      focusEmailWhenEnabled();
      return;
    }
    if (resolved.state === "reactivation" && canEditRoles) {
      const focusCheckboxWhenAvailable = (attempt = 0) => {
        const checkboxEl = createReactivationCheckboxRef.current;
        if (checkboxEl) {
          checkboxEl.focus();
          return;
        }
        if (attempt >= 6) return;
        setTimeout(() => focusCheckboxWhenAvailable(attempt + 1), 0);
      };
      focusCheckboxWhenAvailable();
      return;
    }
    const fallbackTarget = canEditRoles
      ? createRoleSelectRef.current ?? createCancelButtonRef.current
      : createCancelButtonRef.current;
    fallbackTarget?.focus();
  };

  const saveCreate = async () => {
    const nicknameCheck = validateNickname(createNickname);
    if (!nicknameCheck.ok) {
      if (nicknameCheck.code === "too_short") {
        setCreateNicknameCheckState("too_short");
      } else if (nicknameCheck.code !== "empty") {
        setCreateNicknameCheckState("invalid");
      }
      setCreateError(nicknameCheck.message);
      return;
    }
    const nicknameValue = nicknameCheck.nickname;
    const resolved = await resolveCreateNicknameContext(nicknameValue);
    if (resolved.state === "invalid" || resolved.state === "too_short") {
      return;
    }
    if (resolved.state === "active_conflict") {
      setCreateError(
        createSuggestedNickname
          ? `Dieser Login-Name ist im Tenant bereits aktiv. Vorschlag: ${createSuggestedNickname}`
          : "Dieser Login-Name ist im Tenant bereits aktiv.",
      );
      return;
    }
    if (resolved.state === "exists_in_tenant") {
      setCreateError("Dieser Teilnehmer existiert bereits im Studio. Bitte bearbeiten oder erneut einladen.");
      return;
    }

    const isReactivationFlow = resolved.state === "reactivation";
    const reactivationUserId = isReactivationFlow ? resolved.match?.userId ?? null : null;

    let displayNameCanonical: string | undefined;
    if (createDisplayName.trim()) {
      const displayNameCheck = validateDisplayName(createDisplayName);
      if (!displayNameCheck.ok) {
        setCreateError(displayNameCheck.message);
        return;
      }
      displayNameCanonical = displayNameCheck.displayName;
    } else if (!isReactivationFlow) {
      setCreateError("Bitte einen Spitznamen eingeben.");
      return;
    } else if (resolved.match?.displayName?.trim()) {
      displayNameCanonical = resolved.match.displayName.trim();
    }

    const emailValue = (isReactivationFlow && !(canEditRoles && createOverwriteEmailOnReactivate))
      ? (resolved.match?.email ?? "").trim()
      : createEmail.trim();
    const isValidEmailOrEmpty =
      emailValue.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
    if (!isValidEmailOrEmpty) {
      setCreateError("Bitte eine gültige E-Mail-Adresse eingeben (oder leer lassen).");
      return;
    }

    setCreateSaving(true);
    setCreateError("");
    try {
      const shouldPreUpdateEmailForReactivation =
        canEditRoles &&
        !!reactivationUserId &&
        createOverwriteEmailOnReactivate &&
        emailValue.length > 0;

      if (shouldPreUpdateEmailForReactivation) {
        await updateParticipant(reactivationUserId, { email: emailValue });
      }

      // #67: Teilnehmer anlegen ohne Einladung (kein Cognito/SES).
      // Wir legen zunächst ohne E-Mail an, speichern E-Mail (falls vorhanden) danach separat im Profil.
      const result = await inviteUser({
        nickname: nicknameValue,
        ...(displayNameCanonical ? { displayName: displayNameCanonical } : {}),
        role: canEditRoles ? createRole : "participant",
      });
      if (result.error === "Nickname already exists") {
        setCreateError("Dieser Login-Name ist bereits vergeben.");
        return;
      }
      if (!result.success) {
        setCreateError(result.error || "Teilnehmer konnte nicht angelegt werden.");
        return;
      }

      if (
        emailValue.length > 0 &&
        (!result.reactivated || (canEditRoles && createOverwriteEmailOnReactivate)) &&
        !shouldPreUpdateEmailForReactivation
      ) {
        await updateParticipant(result.username ?? nicknameValue.toLowerCase(), { email: emailValue });
      } else if (emailValue.length > 0 && result.reactivated && (!canEditRoles || !createOverwriteEmailOnReactivate)) {
        setBulkInviteResult(
          "Reaktivierung: bestehende E-Mail bleibt unverändert.",
        );
      }

      const effectiveEmail = emailValue || createEmail;
      if (result.reactivated) {
        const reactivationNotificationTarget =
          canEditRoles && createOverwriteEmailOnReactivate && emailValue
            ? emailValue
            : "bestehende Profil-E-Mail";
        if (result.emailSent) {
          setBulkInviteResult(
            `Reaktivierung: Info-Mail gesendet an ${reactivationNotificationTarget}.`,
          );
        } else {
          setBulkInviteResult("Reaktivierung erfolgt, aber E-Mail konnte nicht versendet werden.");
        }
      } else if (result.emailSent) {
        setBulkInviteResult(
          effectiveEmail
            ? `Einladung gesendet an ${effectiveEmail}.`
            : "Einladung wurde gesendet.",
        );
      } else if (effectiveEmail) {
        setBulkInviteResult("Einladung angestoßen, aber E-Mail konnte nicht versendet werden.");
      }

      setCreateOpen(false);
      await refreshParticipants();
    } catch (err) {
      console.error("Failed to create participant", err);
      setCreateError("Teilnehmer konnte nicht angelegt werden.");
    } finally {
      setCreateSaving(false);
    }
  };

  const sendInviteForParticipant = async (
    p: ParticipantWithStatus,
    options?: { refreshAfter?: boolean },
  ) => {
    if (!p.email) return;
    if (!canEditRoles && !canTrainerManageTarget(p)) return;
    if (p.status === "active" && !canEditRoles) return;

    const refreshAfter = options?.refreshAfter ?? true;
    const userId = p.userId;
    const effectiveRole: UserRole = p.role ?? "participant";

    // Avoid stale global status text from previous create/bulk actions.
    setBulkInviteResult("");
    setInviteSendingByUserId((prev) => ({ ...prev, [userId]: true }));
    setInviteResultByUserId((prev) => ({ ...prev, [userId]: "" }));
    try {
      const result = await inviteUser({
        email: p.email,
        nickname: userId,
        role: effectiveRole,
      });

      if (result.error) {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]: `Fehler beim Einladen: ${result.error}`,
        }));
        return { ok: false as const };
      }

      if (result.emailSent) {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]:
            result.reactivated
              ? `Zugang reaktiviert. Info-Mail gesendet an ${p.email}.`
              : p.status === "active"
                ? `Einladungslink zur Passwort-Recovery gesendet an ${p.email}.`
                : `Einladung gesendet an ${p.email}.`,
        }));
      } else {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]: "Einladung angestoßen, aber E-Mail konnte nicht versendet werden.",
        }));
      }

      if (refreshAfter) {
        try {
          await refreshParticipants();
        } catch (refreshErr) {
          console.warn("Invite succeeded but participant refresh failed", refreshErr);
          setInviteResultByUserId((prev) => ({
            ...prev,
            [userId]:
              "Einladung gesendet, aber die Liste konnte nicht aktualisiert werden. Bitte Seite neu laden.",
          }));
          return { ok: true as const };
        }
      }
      return { ok: true as const };
    } catch (err) {
      console.error("Failed to send invite", err);
      setInviteResultByUserId((prev) => ({ ...prev, [userId]: "Fehler beim Einladen." }));
      return { ok: false as const };
    } finally {
      setInviteSendingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const sendPasswordResetForParticipant = async (
    p: ParticipantWithStatus,
    options?: { refreshAfter?: boolean },
  ): Promise<{ ok: boolean; emailSent: boolean } | undefined> => {
    if (!p.email) return undefined;
    if (p.status !== "active") return undefined;

    const refreshAfter = options?.refreshAfter ?? true;
    const userId = p.userId;
    // Avoid stale global status text from previous create/bulk actions.
    setBulkInviteResult("");
    setInviteSendingByUserId((prev) => ({ ...prev, [userId]: true }));
    setInviteResultByUserId((prev) => ({ ...prev, [userId]: "" }));
    try {
      const result = await resetParticipantPassword(userId);
      if (result.emailSent) {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]: `Passwort-Reset-Mail gesendet an ${p.email}.`,
        }));
      } else {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]: "Passwort-Reset angestoßen, aber E-Mail konnte nicht versendet werden.",
        }));
      }
      if (refreshAfter) {
        await refreshParticipants();
      }
      return { ok: true, emailSent: !!result.emailSent };
    } catch (err) {
      console.error("Failed to reset password", err);
      setInviteResultByUserId((prev) => ({ ...prev, [userId]: "Fehler beim Passwort-Reset." }));
      return { ok: false, emailSent: false };
    } finally {
      setInviteSendingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const toggleSelectedInviteUserId = (userId: string, checked: boolean) => {
    setSelectedInviteUserIds((prev) => ({ ...prev, [userId]: checked }));
  };

  const toggleSelectAllEligible = (checked: boolean) => {
    if (!checked) {
      setSelectedInviteUserIds({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const id of inviteEligibleUserIds) next[id] = true;
    setSelectedInviteUserIds(next);
  };

  const sendBulkInvites = async () => {
    if (bulkInviteSending) return;
    if (selectedEligibleUserIds.length === 0) return;

    setBulkInviteSending(true);
    setBulkInviteResult("");

    let ok = 0;
    let failed = 0;

    try {
      const byId = new Map(safeParticipants.map((p) => [p.userId, p]));
      for (const userId of selectedEligibleUserIds) {
        const p = byId.get(userId);
        if (!p || !isInviteEligible(p)) continue;

        // Pro User UI-Feedback beibehalten, aber Refresh erst am Ende.
        const res = await sendInviteForParticipant(p, { refreshAfter: false });
        if (res?.ok) ok += 1;
        else failed += 1;
      }
    } finally {
      await refreshParticipants();
      setBulkInviteSending(false);
      setBulkInviteResult(
        failed > 0 ? `${ok} Einladung(en) gesendet, ${failed} fehlgeschlagen.` : `${ok} Einladung(en) gesendet.`,
      );
    }
  };

  const confirmDeleteParticipant = async () => {
    if (!deleteTarget) return;
    const userId = deleteTarget.userId;
    setDeleteRunningByUserId((prev) => ({ ...prev, [userId]: true }));
    setBulkInviteResult("");

    try {
      const result = await deleteParticipant(userId);
      setBulkInviteResult(
        result.profileDeleted
          ? `Teilnehmer "${userId}" entfernt (inkl. Profil-Cleanup).`
          : `Teilnehmer "${userId}" aus diesem Studio entfernt.`,
      );
      if (result.notificationEmail) {
        setBulkInviteResult((prev) =>
          `${prev} ${
            result.notificationEmailSent
              ? `Info-Mail gesendet an ${result.notificationEmail}.`
              : `Info-Mail an ${result.notificationEmail} konnte nicht versendet werden.`
          }`,
        );
      }
      setDeleteTarget(null);
      await refreshParticipants();
    } catch (err) {
      console.error("Failed to delete participant", err);
      setBulkInviteResult(`Teilnehmer "${userId}" konnte nicht gelöscht werden.`);
    } finally {
      setDeleteRunningByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };
  
  return (
    <>
      {canEditRoles && tenant && onTenantUpdated ? (
        <StudioSettingsSection tenant={tenant} onSaved={onTenantUpdated} />
      ) : null}
      <div className="admin-panel">
      <section aria-labelledby="participants-heading">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h3 id="participants-heading" style={{ margin: 0 }}>
            Teilnehmer verwalten
          </h3>
          <button
            type="button"
            title="Neuer Teilnehmer"
            aria-label="Neuer Teilnehmer"
            onClick={openCreate}
            disabled={createSaving || editingSaving}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <Plus size={16} aria-hidden="true" />
              Neu
            </span>
          </button>
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <input
            type="search"
            placeholder="Suche (Name, Login-Name oder E-Mail)"
            aria-label="Teilnehmer suchen"
            value={participantsSearch}
            onChange={(e) => setParticipantsSearch(e.target.value)}
            className="dialog-field dialog-search-field"
            style={{ width: "100%", maxWidth: 360 }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            aria-label="Ausgewählte einladen"
            title={
              selectedEligibleUserIds.length === 0
                ? "Wähle Teilnehmer mit E-Mail aus"
                : "Einladung an ausgewählte Teilnehmer senden/erneut senden"
            }
            disabled={
              selectedEligibleUserIds.length === 0 ||
              bulkInviteSending ||
              participantsLoading ||
              editingSaving ||
              createSaving
            }
            onClick={sendBulkInvites}
          >
            {bulkInviteSending ? "Sende..." : `Ausgewählte einladen (${selectedEligibleUserIds.length})`}
          </button>
          {bulkInviteResult && (
            <span style={{ color: "#374151", fontSize: 12 }} role="status" aria-live="polite">
              {bulkInviteResult}
            </span>
          )}
        </div>

        {participantsError && (
          <p style={{ margin: "0.5rem 0", color: "red", whiteSpace: "pre-line" }} role="alert">
            {participantsError}
          </p>
        )}

        {participantsLoading ? (
          <p>Teilnehmer werden geladen...</p>
        ) : safeParticipants.length === 0 ? (
          <p>Keine Teilnehmer gefunden.</p>
        ) : (
          <div className="participants-table">
            <div className="participants-table-scroll">
              <div
                className="participants-table-inner"
                role="table"
                aria-label="Teilnehmerliste"
              >
              <div
              role="row"
              style={{
                display: "grid",
                gridTemplateColumns: "36px 130px 110px 150px minmax(220px, 1fr) 220px",
                gap: "0.5rem",
                alignItems: "center",
                fontWeight: 600,
                marginBottom: "0.5rem",
              }}
            >
              <span role="columnheader" style={{ display: "inline-flex", justifyContent: "center" }}>
                <input
                  type="checkbox"
                  aria-label="Alle (einladbar) auswählen"
                  checked={allEligibleSelected}
                  disabled={inviteEligibleUserIds.length === 0 || participantsLoading || bulkInviteSending}
                  onChange={(e) => toggleSelectAllEligible(e.target.checked)}
                />
              </span>
              <span role="columnheader">Name</span>
              <span role="columnheader">Rolle</span>
              <span role="columnheader">Status</span>
                  <span role="columnheader" style={{ whiteSpace: "nowrap" }}>E-Mail</span>
                  <span role="columnheader" style={{ whiteSpace: "nowrap" }}>Aktion</span>
              </div>
              {safeParticipants.map((p) => (
                <div
                  key={p.userId}
                  role="row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 130px 110px 150px minmax(220px, 1fr) 220px",
                    gap: "0.5rem",
                    alignItems: "center",
                    padding: "0.25rem 0",
                  }}
                >
                  <span role="cell" style={{ display: "inline-flex", justifyContent: "center" }}>
                    <input
                      type="checkbox"
                      aria-label={`Auswählen ${p.userId}`}
                      checked={!!selectedInviteUserIds[p.userId]}
                      disabled={!isInviteEligible(p) || participantsLoading || bulkInviteSending}
                      title={
                        !p.email
                          ? "E-Mail fehlt"
                          : p.status === "active"
                            ? "Bereits registriert (kein Sammelversand)"
                            : "Auswählen"
                      }
                      onChange={(e) => toggleSelectedInviteUserId(p.userId, e.target.checked)}
                    />
                  </span>
                  <span role="rowheader" style={{ fontWeight: 600, minWidth: 0 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {participantDisplayName(p)}
                    </span>
                    {p.displayName?.trim() &&
                      p.displayName.trim().toLowerCase() !== (p.userId || "").trim().toLowerCase() && (
                        <span
                          style={{
                            display: "block",
                            fontSize: 11,
                            fontWeight: 400,
                            color: "#6b7280",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.userId}
                        </span>
                      )}
                  </span>
                  <span role="cell" style={{ color: "#374151" }}>
                    {getRoleLabel(p.role)}
                  </span>
                  <span
                    role="cell"
                    style={{ display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: getStatusPresentation(p.status).color,
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#374151" }}>
                      {getStatusPresentation(p.status).label}
                    </span>
                  </span>
                  <span
                    role="cell"
                    style={{
                      color: p.email ? "#111827" : "#9ca3af",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                  >
                    {p.email ?? "-"}
                  </span>
                  <div
                    role="cell"
                    style={{
                      display: "flex",
                      gap: "0.25rem",
                      justifyContent: "flex-end",
                      flexWrap: "nowrap",
                      alignItems: "center",
                      position: "relative",
                      width: "100%",
                      justifySelf: "end",
                    }}
                  >
                    <button
                      type="button"
                      title={
                        !p.email
                          ? "E-Mail fehlt"
                          : !isInviteEligible(p)
                            ? "Einladen nicht möglich"
                            : p.status === "invited"
                              ? "Einladung erneut senden"
                              : "Einladung senden"
                      }
                      aria-label={
                        p.status === "invited"
                          ? `Erneut einladen ${p.userId}`
                          : `Einladen ${p.userId}`
                      }
                      disabled={
                        !isInviteEligible(p) ||
                        !!inviteSendingByUserId[p.userId] ||
                        participantsLoading ||
                        editingSaving ||
                        createSaving
                      }
                      onClick={() => sendInviteForParticipant(p)}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Mail size={14} aria-hidden="true" />
                        {inviteSendingByUserId[p.userId] ? "..." : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      title={
                        !canEditEmailForParticipant(p)
                          ? "E-Mail von registrierten Teilnehmern nur für Admin"
                          : `Bearbeiten ${p.userId}`
                      }
                      aria-label={`Bearbeiten ${p.userId}`}
                      disabled={
                        participantsLoading ||
                        editingSaving ||
                        !!deleteRunningByUserId[p.userId] ||
                        !canEditEmailForParticipant(p)
                      }
                      onClick={() => startEditEmail(p)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    {canEditRoles && (
                      <button
                        type="button"
                        title={`Löschen ${p.userId}`}
                        aria-label={`Löschen ${p.userId}`}
                        disabled={
                          participantsLoading ||
                          editingSaving ||
                          createSaving ||
                          bulkInviteSending ||
                          !!inviteSendingByUserId[p.userId] ||
                          !!deleteRunningByUserId[p.userId]
                        }
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {inviteResultByUserId[p.userId] && (
                    <div style={{ gridColumn: "1 / -1", color: "#374151", fontSize: 12 }} role="status" aria-live="polite">
                      {inviteResultByUserId[p.userId]}
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {editingUserId && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Teilnehmer E-Mail bearbeiten"
          ref={editingModalRef}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (shouldHandleModalEscape(event)) {
              if (editingSaving) return;
              event.preventDefault();
              setEditingUserId(null);
              return;
            }
            if (!shouldHandleModalEnter(event)) return;
            if (editingSaving || !editingHasChanges) return;
            event.preventDefault();
            void saveEditEmail();
          }}
        >
          <div className="modal modal-compact">
            <div className="modal-header">
              <h4>Teilnehmer bearbeiten</h4>
            </div>
            <div className="modal-body">
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              Login-Name: <strong>{editingUserId}</strong>
            </p>

            <div className="dialog-stack">
              <input
                type="text"
                aria-label="Spitzname"
                placeholder="Spitzname"
                value={editingDisplayName}
                onChange={(e) => setEditingDisplayName(e.target.value)}
                disabled={editingSaving}
                className="dialog-field"
              />
              <input
                type="email"
                aria-label="E-Mail"
                placeholder="E-Mail"
                value={editingEmail}
                onChange={(e) => setEditingEmail(e.target.value)}
                disabled={editingSaving}
                className="dialog-field"
              />
              {canEditRoles && (
                <TermDateSelect
                  aria-label="Rolle bearbeiten"
                  value={editingRole}
                  disabled={editingSaving}
                  className="dialog-field"
                  options={ROLE_OPTIONS.map((role) => ({
                    value: role,
                    label: ROLE_LABELS_DE[role],
                  }))}
                  onChange={(role) => setEditingRole(role as UserRole)}
                />
              )}
              {canEditRoles && editingOriginal?.status === "active" && (
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={editingForcePasswordResetOnEmailChange}
                    onChange={(e) => setEditingForcePasswordResetOnEmailChange(e.target.checked)}
                    disabled={editingSaving}
                  />
                  Passwort-Reset-Mail senden
                </label>
              )}
              {editingError && <p style={{ color: "crimson", margin: 0 }}>{editingError}</p>}
            </div>

            <div className="modal-actions dialog-actions">
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => setEditingUserId(null)}
                disabled={editingSaving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={saveEditEmail}
                disabled={editingSaving || !editingHasChanges}
              >
                {editingSaving
                  ? "Speichere..."
                  : editingSendsInvite || (canEditRoles && editingOriginal?.status === "active")
                    ? "Speichern und Senden"
                    : "Speichern"}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Teilnehmer anlegen"
          ref={createModalRef}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (shouldHandleModalEscape(event)) {
              if (createSaving) return;
              event.preventDefault();
              setCreateOpen(false);
              return;
            }
            if (!shouldHandleModalEnter(event)) return;
            if (createSaving || createActiveConflict || createNicknameCheckState === "exists_in_tenant") {
              return;
            }
            event.preventDefault();
            void saveCreate();
          }}
        >
          <div className="modal modal-compact">
            <div className="modal-header">
              <h4>Teilnehmer anlegen</h4>
            </div>
            <div className="modal-body">
            <div className="dialog-stack">
              <input
                type="text"
                aria-label="Spitzname"
                placeholder="Spitzname"
                ref={createDisplayNameInputRef}
                value={createDisplayName}
                onChange={(e) => {
                  const nextDisplayName = e.target.value;
                  setCreateDisplayName(nextDisplayName);
                  setCreateError("");
                  syncNicknameFromDisplayName(nextDisplayName);
                }}
                onBlur={() => {
                  if (createNickname.trim().length >= NICKNAME_MIN_LENGTH) {
                    void resolveCreateNicknameContext(createNickname);
                  }
                }}
                disabled={createSaving}
                className="dialog-field"
              />
              <input
                type="text"
                aria-label="Login-Name"
                placeholder="Login-Name"
                ref={createNicknameInputRef}
                value={createNickname}
                onChange={(e) => {
                  const nextNickname = e.target.value;
                  setCreateNickname(nextNickname);
                  setCreateNicknameManual(true);
                  resetCreateNicknameResolution();
                  setCreateError("");
                }}
                onKeyDown={(event) => {
                  void handleCreateNicknameKeyDown(event);
                }}
                onBlur={() => {
                  void resolveCreateNicknameContext(createNickname);
                }}
                disabled={createSaving}
                className="dialog-field"
                aria-invalid={createNicknameCheckState === "invalid" || createNicknameCheckState === "too_short"}
              />

              {createIsReactivation && (
                <>
                  <p style={{ margin: "0.25rem 0 0", color: "#92400e", fontSize: 12 }}>
                    Reaktivierung erkannt fuer bestehenden Teilnehmer: {createReactivationUserId ?? "-"}
                  </p>
                  {createCanUnlockReactivationEmail ? (
                    <>
                      <label
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          borderRadius: 6,
                          padding: "2px 4px",
                          outline: createReactivationCheckboxFocused ? "2px solid #2563eb" : "none",
                          outlineOffset: 2,
                        }}
                      >
                        <input
                          type="checkbox"
                          ref={createReactivationCheckboxRef}
                          checked={createOverwriteEmailOnReactivate}
                          onChange={(e) => {
                            const nextChecked = e.target.checked;
                            setCreateOverwriteEmailOnReactivate(nextChecked);
                            if (!nextChecked) {
                              const fallbackEmail = createMatchedParticipant?.email ?? "";
                              setCreateEmail(fallbackEmail);
                              setCreateEmailAutoFilled(!!fallbackEmail);
                            }
                          }}
                          onFocus={() => setCreateReactivationCheckboxFocused(true)}
                          onBlur={() => setCreateReactivationCheckboxFocused(false)}
                          disabled={createSaving}
                          style={{ accentColor: "#2563eb" }}
                        />
                        E-Mail fuer Reaktivierung bearbeiten
                        <strong style={{ color: createOverwriteEmailOnReactivate ? "#166534" : "#6b7280" }}>
                          {createOverwriteEmailOnReactivate ? "(aktiv)" : "(inaktiv)"}
                        </strong>
                      </label>
                      <p style={{ margin: "0.1rem 0 0", color: "#4b5563", fontSize: 12 }}>
                        {createOverwriteEmailOnReactivate
                          ? "Bearbeitung aktiv: E-Mail-Feld ist freigegeben."
                          : "Bearbeitung inaktiv: E-Mail-Feld bleibt gesperrt."}
                      </p>
                      <p
                        role="status"
                        aria-live="polite"
                        style={{ margin: 0, fontSize: 11, color: "#6b7280" }}
                      >
                        {createOverwriteEmailOnReactivate
                          ? "Status: E-Mail-Bearbeitung aktiviert."
                          : "Status: E-Mail-Bearbeitung deaktiviert."}
                      </p>
                    </>
                  ) : (
                    <p style={{ margin: "0.15rem 0 0", color: "#4b5563", fontSize: 12 }}>
                      Bei Reaktivierung bleibt die bestehende E-Mail unverändert.
                    </p>
                  )}
                  <p style={{ margin: "0.1rem 0 0", color: "#4b5563", fontSize: 12 }}>
                    {createOverwriteEmailOnReactivate && createEmail.trim()
                      ? `Mail geht an: ${createEmail.trim()}`
                      : "Mail geht an: bestehende Profil-E-Mail"}
                  </p>
                </>
              )}

              <input
                type="email"
                aria-label="E-Mail"
                placeholder="E-Mail"
                ref={createEmailInputRef}
                value={createEmail}
                onChange={(e) => {
                  if (!createEmailEditable) return;
                  setCreateEmail(e.target.value);
                  setCreateEmailAutoFilled(false);
                }}
                disabled={createSaving || !createEmailEditable}
                className="dialog-field"
              />
              {createNicknameCheckState === "too_short" && (
                <p style={{ margin: "0.25rem 0 0", color: "#92400e", fontSize: 12 }}>
                  Login-Name-Prüfung startet ab {NICKNAME_MIN_LENGTH} Zeichen.
                </p>
              )}
              {createNicknameCheckState === "exists_in_tenant" && (
                <p style={{ margin: "0.25rem 0 0", color: "#92400e", fontSize: 12 }}>
                  Teilnehmer existiert bereits im Studio. Bitte bearbeiten oder erneut einladen.
                </p>
              )}
              {createEmailAutoFilled && (
                <p style={{ margin: "0.25rem 0 0", color: "#4b5563", fontSize: 12 }}>
                  E-Mail aus bestehendem Profil uebernommen.
                </p>
              )}
              {createActiveConflict && (
                <div style={{ margin: "0.25rem 0 0", color: "#991b1b", fontSize: 12 }}>
                  <p style={{ margin: 0 }}>
                    Dieser Login-Name ist im aktuellen Tenant bereits aktiv.
                  </p>
                  {createSuggestedNickname && (
                    <p style={{ margin: "0.15rem 0 0" }}>
                      Vorschlag fuer neuen Login-Namen: <strong>{createSuggestedNickname}</strong>
                      {" "}
                      <button
                        type="button"
                        onClick={() => {
                          const nextNickname = createSuggestedNickname;
                          setCreateNickname(nextNickname);
                          setCreateNicknameManual(true);
                          setCreateError("");
                          resetCreateNicknameResolution();
                          setCreateNicknameCheckState("new");
                          queueMicrotask(() => {
                            void resolveCreateNicknameContext(nextNickname).then((resolved) => {
                              if (resolved.state === "new") {
                                createEmailInputRef.current?.focus();
                              }
                            });
                          });
                        }}
                        disabled={createSaving}
                        style={{ marginLeft: 6 }}
                      >
                        Uebernehmen
                      </button>
                    </p>
                  )}
                </div>
              )}

              {canEditRoles && (
                <TermDateSelect
                  aria-label="Rolle"
                  ref={createRoleSelectRef}
                  value={createRole}
                  disabled={createSaving}
                  className="dialog-field"
                  options={ROLE_OPTIONS.map((role) => ({
                    value: role,
                    label: ROLE_LABELS_DE[role],
                  }))}
                  onChange={(role) =>
                    setCreateRole(role as "participant" | "instructor" | "admin")
                  }
                />
              )}

              {createError && <p style={{ color: "crimson", margin: 0 }}>{createError}</p>}
            </div>

            <div className="modal-actions dialog-actions">
              <button
                type="button"
                className="modal-action-btn"
                ref={createCancelButtonRef}
                onClick={() => setCreateOpen(false)}
                disabled={createSaving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={saveCreate}
                disabled={createSaving || createActiveConflict || createNicknameCheckState === "exists_in_tenant"}
              >
                {createSaving
                  ? createReactivationUserId
                    ? "Reaktiviere..."
                    : "Lege an..."
                  : createReactivationUserId
                    ? "Reaktivieren"
                    : "Anlegen"}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Teilnehmer löschen"
          ref={deleteModalRef}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (!shouldHandleModalEscape(event)) return;
            if (deleteRunningByUserId[deleteTarget.userId]) return;
            event.preventDefault();
            setDeleteTarget(null);
          }}
        >
          <div className="modal modal-compact">
            <div className="modal-header">
              <h4>Teilnehmer löschen</h4>
            </div>
            <div className="modal-body">
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              Teilnehmer <strong>{participantDisplayName(deleteTarget)}</strong>
              {deleteTarget.displayName?.trim()
                ? ` (${deleteTarget.userId})`
                : ""}{" "}
              aus diesem Studio entfernen?
            </p>
            <p style={{ marginTop: 0, color: "#6b7280", fontSize: 14 }}>
              {deleteTargetHasLoginHistory
                ? "Dieser Zugang wird nur aus diesem Studio entfernt. Das Profil bleibt erhalten und es wird eine Info-Mail versendet."
                : "Dieser Nutzer hat sich noch nicht registriert. Der Eintrag wird (falls keine weitere Studio-Zuordnung existiert) vollständig entfernt, ohne Info-Mail."}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => setDeleteTarget(null)}
                disabled={!!deleteRunningByUserId[deleteTarget.userId]}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={confirmDeleteParticipant}
                disabled={!!deleteRunningByUserId[deleteTarget.userId]}
              >
                {deleteRunningByUserId[deleteTarget.userId] ? "Lösche..." : "Löschen"}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}