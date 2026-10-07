'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowTopRightOnSquareIcon,
  AtSymbolIcon,
  ChatBubbleLeftRightIcon,
  CodeBracketIcon,
  CodeBracketSquareIcon,
  PencilSquareIcon,
  PlusIcon,
  RectangleStackIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Button, Card, Input, Select } from '@/components/ui';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { useCompanyStore } from '@/hooks/useCompanyStore';
import { bcClient } from '@/services/bc';
import type { BCProjectSourceLink, ProjectSourceLinkType } from '@/types';
import { cn } from '@/utils';
import {
  PROJECT_SOURCE_LINK_TYPES,
  SOURCE_LINK_PLACEHOLDERS,
  SOURCE_LINK_TYPE_LABELS,
  bcErrorText,
  normaliseSourceLinkValue,
  sameSourceLink,
  sourceLinkUrl,
} from '@/utils/projectSourceLinks';

const TYPE_ICONS: Record<ProjectSourceLinkType, typeof CodeBracketIcon> = {
  GitHubRepo: CodeBracketIcon,
  DevOpsRepo: CodeBracketSquareIcon,
  DevOpsProject: RectangleStackIcon,
  MeetingKeyword: ChatBubbleLeftRightIcon,
  AttendeeDomain: AtSymbolIcon,
};

interface Draft {
  type: ProjectSourceLinkType;
  value: string;
  jobTaskNo: string;
  useMonthlyBlock: boolean;
}

const EMPTY_DRAFT: Draft = { type: 'GitHubRepo', value: '', jobTaskNo: '', useMonthlyBlock: false };

/**
 * "Linked sources" on the project page: the repos, DevOps projects, meeting keywords and
 * attendee domains whose time belongs to this project, which Poppie uses to map her time
 * suggestions. Thyme administrators and the project's manager can add, edit and remove them;
 * everyone else sees them read-only. Hidden when the Thyme BC Extension has no
 * projectSourceLinks API (older than 1.20).
 */
export function ProjectSourceLinksCard() {
  const { project, tasks } = useProjectDetailsStore();
  const { selectedCompany } = useCompanyStore();
  const jobNo = project?.code ?? '';

  // undefined = still loading or not available (no API); null = failed to load
  const [links, setLinks] = useState<BCProjectSourceLink[] | null | undefined>(undefined);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  // 'new', a link id being edited, or null
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobNo) return;
    try {
      const [rows, editable] = await Promise.all([
        bcClient.getProjectSourceLinks(jobNo),
        bcClient.canEditProjectSourceLinks(jobNo),
      ]);
      setAvailable(rows !== undefined);
      setLinks(rows ?? undefined);
      setCanEdit(editable);
    } catch {
      setAvailable(true);
      setLinks(null);
    }
  }, [jobNo]);

  useEffect(() => {
    let cancelled = false;
    setLinks(undefined);
    setAvailable(null);
    setEditing(null);
    if (!jobNo) return;
    Promise.all([bcClient.getProjectSourceLinks(jobNo), bcClient.canEditProjectSourceLinks(jobNo)])
      .then(([rows, editable]) => {
        if (cancelled) return;
        setAvailable(rows !== undefined);
        setLinks(rows ?? undefined);
        setCanEdit(editable);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailable(true);
        setLinks(null);
      });
    return () => {
      cancelled = true;
    };
    // The company is part of the key: project numbers repeat across companies
  }, [jobNo, selectedCompany?.id]);

  const taskName = useMemo(() => new Map(tasks.map((t) => [t.code, t.name])), [tasks]);
  const taskOptions = useMemo(
    () => [
      { value: '', label: 'Let Poppie pick the task' },
      ...tasks.map((t) => ({ value: t.code, label: `${t.code} - ${t.name}` })),
    ],
    [tasks]
  );

  const normalised = draft.value.trim() ? normaliseSourceLinkValue(draft.type, draft.value) : null;
  const duplicate =
    normalised?.value !== undefined &&
    (links ?? []).some(
      (l) => l.id !== editing && sameSourceLink(l, { type: draft.type, value: normalised.value })
    );
  const valueError =
    normalised?.error ?? (duplicate ? 'This is already linked to the project.' : undefined);

  const startAdd = () => {
    setDraft(EMPTY_DRAFT);
    setEditing('new');
  };

  const startEdit = (link: BCProjectSourceLink) => {
    setDraft({
      type: link.type,
      value: link.value,
      jobTaskNo: link.jobTaskNo || '',
      useMonthlyBlock: link.useMonthlyBlock,
    });
    setEditing(link.id);
  };

  const cancel = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!normalised?.value || valueError || saving || !editing) return;
    setSaving(true);
    const body = {
      type: draft.type,
      value: normalised.value,
      jobTaskNo: draft.jobTaskNo,
      useMonthlyBlock: draft.useMonthlyBlock,
    };
    try {
      if (editing === 'new') {
        const created = await bcClient.createProjectSourceLink({ jobNo, ...body });
        setLinks((prev) => [...(prev ?? []), created]);
        toast.success('Linked');
      } else {
        const current = links?.find((l) => l.id === editing);
        const updated = await bcClient.updateProjectSourceLink(
          editing,
          body,
          current?.['@odata.etag']
        );
        setLinks((prev) => (prev ?? []).map((l) => (l.id === editing ? { ...l, ...updated } : l)));
        toast.success('Link updated');
      }
      setEditing(null);
      setDraft(EMPTY_DRAFT);
    } catch (error) {
      toast.error(bcErrorText(error, "Couldn't save the link. Please try again."));
      // Someone may have changed it meanwhile: show what BC has now
      if (editing !== 'new') load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (link: BCProjectSourceLink) => {
    if (
      !window.confirm(`Remove ${SOURCE_LINK_TYPE_LABELS[link.type].toLowerCase()} "${link.value}"?`)
    )
      return;
    setBusyId(link.id);
    try {
      await bcClient.deleteProjectSourceLink(link.id, link['@odata.etag']);
      setLinks((prev) => (prev ?? []).filter((l) => l.id !== link.id));
      toast.success('Link removed');
    } catch (error) {
      toast.error(bcErrorText(error, "Couldn't remove the link. Please try again."));
      load();
    } finally {
      setBusyId(null);
    }
  };

  if (!project || available === false) return null;

  const editor = (
    <form
      onSubmit={save}
      className="border-dark-600 bg-dark-700/40 space-y-3 rounded-lg border p-4"
      aria-label={editing === 'new' ? 'Add linked source' : 'Edit linked source'}
    >
      <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
        <Select
          label="Type"
          id="source-link-type"
          options={PROJECT_SOURCE_LINK_TYPES.map((t) => ({
            value: t,
            label: SOURCE_LINK_TYPE_LABELS[t],
          }))}
          value={draft.type}
          onChange={(e) =>
            setDraft((d) => ({ ...d, type: e.target.value as ProjectSourceLinkType }))
          }
        />
        <div>
          <Input
            label="Value"
            id="source-link-value"
            value={draft.value}
            onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
            placeholder={SOURCE_LINK_PLACEHOLDERS[draft.type]}
            autoFocus
            aria-invalid={Boolean(valueError)}
            aria-describedby="source-link-value-help"
          />
          <p
            id="source-link-value-help"
            className={cn('mt-1 text-xs', valueError ? 'text-red-400' : 'text-dark-400')}
          >
            {valueError ??
              (normalised?.value && normalised.value !== draft.value.trim()
                ? `Saved as ${normalised.value}`
                : ' ')}
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <Select
          label="Task"
          id="source-link-task"
          options={taskOptions}
          value={draft.jobTaskNo}
          onChange={(e) => setDraft((d) => ({ ...d, jobTaskNo: e.target.value }))}
        />
        <label className="text-dark-200 flex h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.useMonthlyBlock}
            onChange={(e) => setDraft((d) => ({ ...d, useMonthlyBlock: e.target.checked }))}
            className="accent-thyme-600 h-4 w-4"
          />
          Use the month&apos;s block
        </label>
      </div>
      <p className="text-dark-400 text-xs">
        {draft.useMonthlyBlock
          ? draft.jobTaskNo
            ? 'Time goes to the task named after the month (e.g. “Block 7 - October”), or this task until that block exists.'
            : 'Time goes to the task named after the month (e.g. “Block 7 - October”).'
          : draft.jobTaskNo
            ? 'Time always goes to this task.'
            : "Poppie picks the month's block if the project has them, otherwise its only task."}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          isLoading={saving}
          disabled={!normalised?.value || Boolean(valueError)}
        >
          {editing === 'new' ? 'Add link' : 'Save'}
        </Button>
      </div>
    </form>
  );

  return (
    <Card variant="bordered" className="p-6 print:hidden">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Linked sources</h2>
          <p className="text-dark-400 mt-1 text-sm">
            Repos, DevOps projects, meeting keywords and attendee domains whose time belongs to this
            project. Poppie uses them to put suggested time here.
          </p>
        </div>
        {canEdit && links !== undefined && links !== null && editing === null && (
          <Button size="sm" onClick={startAdd}>
            <PlusIcon className="mr-1.5 h-4 w-4" />
            Add link
          </Button>
        )}
      </div>

      {links === undefined ? (
        <div className="bg-dark-600 h-16 animate-pulse rounded" />
      ) : links === null ? (
        <p className="text-sm text-red-400">
          Couldn&apos;t load the linked sources.{' '}
          <button type="button" className="underline" onClick={load}>
            Try again
          </button>
        </p>
      ) : (
        <div className="space-y-3">
          {links.length === 0 && editing !== 'new' && (
            <p className="text-dark-400 text-sm">
              {canEdit
                ? 'No linked sources yet. Add the repos, DevOps projects, meeting keywords and attendee domains whose time belongs to this project.'
                : 'No linked sources yet. A Thyme administrator or the project manager can add them.'}
            </p>
          )}
          {links.length > 0 && (
            <ul className="divide-dark-700 border-dark-700 divide-y rounded-lg border">
              {links.map((link) => {
                if (editing === link.id) {
                  return (
                    <li key={link.id} className="p-2">
                      {editor}
                    </li>
                  );
                }
                const Icon = TYPE_ICONS[link.type] ?? CodeBracketIcon;
                const url = sourceLinkUrl(link.type, link.value);
                return (
                  <li key={link.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon className="text-thyme-500 h-5 w-5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-dark-400 text-xs">
                        {SOURCE_LINK_TYPE_LABELS[link.type] ?? link.type}
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-thyme-400 truncate text-sm font-medium text-white"
                          >
                            {link.value}
                            <ArrowTopRightOnSquareIcon className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-gray-500" />
                          </a>
                        ) : (
                          <span className="truncate text-sm font-medium text-white">
                            {link.value}
                          </span>
                        )}
                        {link.learned && (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-xs text-purple-300"
                            title="Poppie learned this from approved time. Edit it to make it yours."
                          >
                            <SparklesIcon className="h-3 w-3" aria-hidden="true" />
                            Learned
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hidden shrink-0 text-right text-xs sm:block">
                      <div className="text-gray-300">
                        {link.jobTaskNo
                          ? `${link.jobTaskNo}${taskName.get(link.jobTaskNo) ? ` - ${taskName.get(link.jobTaskNo)}` : ''}`
                          : link.useMonthlyBlock
                            ? "The month's block"
                            : 'Poppie picks the task'}
                      </div>
                      {link.jobTaskNo && link.useMonthlyBlock && (
                        <div className="text-dark-400">or the month&apos;s block</div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEdit(link)}
                          disabled={editing !== null || busyId !== null}
                          aria-label={`Edit ${link.value}`}
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(link)}
                          disabled={editing !== null || busyId !== null}
                          isLoading={busyId === link.id}
                          aria-label={`Remove ${link.value}`}
                          className="hover:text-red-400"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {editing === 'new' && editor}
        </div>
      )}
    </Card>
  );
}
