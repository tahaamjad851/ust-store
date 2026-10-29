"use client";

// Sort control that belongs to the filters form (via the `form` attribute) and submits it on change.
// Without JavaScript, the filters form's Apply button submits the chosen sort too.
export function SortSelect({
  formId,
  value,
  options,
}: {
  formId: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="listing-sort" className="text-label-md">
        Sort
      </label>
      <select
        id="listing-sort"
        name="sort"
        form={formId}
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-11 rounded-lg border border-input bg-card px-3 text-body-lg md:text-body-md"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
