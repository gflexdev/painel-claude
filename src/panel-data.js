// O que é só do painel, e não do Claude Code: quais sessões o painel abriu (com o id curto de `claude --bg` e a
// sessão mãe, se houver) e quais estão arquivadas no painel. Fica em painel.json (0600), ao lado do estado.
// Arquivar aqui não mexe no app do Claude: só esconde a sessão das telas do painel.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

export const MAX_KEPT = 500;
const ID = /^[\w-]{1,80}$/;
const JOB_ID = /^[0-9a-z]{4,40}$/i;
const isId = (value) => typeof value === 'string' && ID.test(value);
const isJob = (value) => typeof value === 'string' && JOB_ID.test(value);

const EMPTY = Object.freeze({ jobs: {}, parents: {}, archived: [] });

/** Lê e valida o arquivo; o que não for id válido fica de fora. */
export function loadPanelData(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return {
      jobs: Object.fromEntries(Object.entries(raw.jobs ?? {}).filter(([id, job]) => isId(id) && isJob(job))),
      parents: Object.fromEntries(Object.entries(raw.parents ?? {}).filter(([id, parent]) => isId(id) && isId(parent) && id !== parent)),
      archived: [...new Set((Array.isArray(raw.archived) ? raw.archived : []).filter(isId))],
    };
  } catch {
    return EMPTY;
  }
}

const lastEntries = (object) => Object.fromEntries(Object.entries(object).slice(-MAX_KEPT));

export function createPanelData({ file, onChange = () => {}, onError = () => {} }) {
  let data = loadPanelData(file);

  const commit = (next) => {
    data = { jobs: lastEntries(next.jobs), parents: lastEntries(next.parents), archived: next.archived.slice(-MAX_KEPT) };
    try {
      writeFileSync(`${file}.tmp`, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    } catch (error) {
      onError('falha ao salvar painel.json', error);
    }
    onChange();
  };

  return {
    /** Sessão aberta pelo painel: guarda o id curto (para parar e apagar) e a mãe, se houver. */
    adopt(sessionId, { jobId, parentId = null }) {
      if (!isId(sessionId) || !isJob(jobId)) return false;
      const parents = isId(parentId) && parentId !== sessionId ? { ...data.parents, [sessionId]: parentId } : data.parents;
      commit({ ...data, jobs: { ...data.jobs, [sessionId]: jobId }, parents });
      return true;
    },
    /** A sessão foi apagada: esquece o id curto, a mãe e o arquivamento. */
    forget(sessionId) {
      if (!data.jobs[sessionId] && !data.parents[sessionId] && !data.archived.includes(sessionId)) return;
      const { [sessionId]: _job, ...jobs } = data.jobs;
      const { [sessionId]: _parent, ...parents } = data.parents;
      commit({ jobs, parents, archived: data.archived.filter((id) => id !== sessionId) });
    },
    setArchived(sessionId, archived) {
      if (!isId(sessionId) || data.archived.includes(sessionId) === archived) return false;
      commit({ ...data, archived: archived ? [...data.archived, sessionId] : data.archived.filter((id) => id !== sessionId) });
      return true;
    },
    jobOf: (sessionId) => data.jobs[sessionId] ?? null,
    parentOf: (sessionId) => data.parents[sessionId] ?? null,
    isArchived: (sessionId) => data.archived.includes(sessionId),
    archivedIds: () => [...data.archived],
    /** Profundidade na família do painel (1 = filha direta), com teto para não rodar em ciclo. */
    depthOf(sessionId) {
      let depth = 0;
      for (let id = sessionId; data.parents[id] && depth < 8; id = data.parents[id]) depth += 1;
      return depth;
    },
  };
}
