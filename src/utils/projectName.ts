/** A project's name is BC's Job Description, Text[100] */
export const PROJECT_NAME_MAX_LENGTH = 100;

/** Why a project name can't be used, or null if it can (checked after trimming) */
export function getProjectNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Project name cannot be empty';
  if (trimmed.length > PROJECT_NAME_MAX_LENGTH) {
    return `Project name cannot be longer than ${PROJECT_NAME_MAX_LENGTH} characters`;
  }
  return null;
}
