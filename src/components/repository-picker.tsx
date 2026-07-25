"use client";

import { useMemo, useState } from "react";

export type GitHubRepositoryOption = {
  id: number;
  full_name: string;
  clone_url: string;
  default_branch: string;
  installation_id: number;
  private: boolean;
};

const RESULT_LIMIT = 50;

export function RepositoryPicker({
  repositories,
  selectedId,
  installUrl,
  onSelect,
}: {
  repositories: GitHubRepositoryOption[];
  selectedId: number | null;
  installUrl?: string;
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return repositories.filter(
      (repository) => !normalized || repository.full_name.toLowerCase().includes(normalized),
    );
  }, [query, repositories]);
  const visible = matches.slice(0, RESULT_LIMIT);

  return (
    <fieldset className="form-control min-w-0">
      <legend className="label-text mb-1">GitHub repository</legend>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="input input-bordered w-full"
        placeholder={`Search ${repositories.length} accessible repositories`}
        aria-label="Search GitHub repositories"
        autoComplete="off"
      />
      <div className="mt-2 max-h-56 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1">
        {visible.map((repository) => {
          const selected = repository.id === selectedId;
          return (
            <button
              key={`${repository.installation_id}:${repository.id}`}
              type="button"
              aria-pressed={selected}
              className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                selected ? "bg-primary text-primary-content" : "hover:bg-base-200"
              }`}
              onClick={() => onSelect(repository.id)}
            >
              <span className="min-w-0 truncate font-medium">{repository.full_name}</span>
              {repository.private && (
                <span
                  className={`badge badge-sm shrink-0 ${
                    selected ? "border-primary-content/40" : "badge-ghost"
                  }`}
                >
                  private
                </span>
              )}
            </button>
          );
        })}
        {matches.length === 0 && (
          <p className="px-3 py-5 text-center text-sm text-base-content/60">
            No accessible repository matches this search.
          </p>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-1 text-xs text-base-content/60 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {matches.length > RESULT_LIMIT
            ? `Showing the first ${RESULT_LIMIT} of ${matches.length} matches. Refine your search.`
            : `${matches.length} of ${repositories.length} accessible repositories`}
        </span>
        {installUrl && (
          <a className="link shrink-0" href={installUrl}>
            Manage GitHub access
          </a>
        )}
      </div>
    </fieldset>
  );
}
