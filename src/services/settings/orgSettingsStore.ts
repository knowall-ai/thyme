/**
 * Server-side store for per-organisation settings, keyed by Entra tenant ID. Settings
 * live in Timmie itself (not Business Central), so they work whatever the organisation
 * connects to.
 *
 * Production uses an Azure Table (`ORG_SETTINGS_TABLE_ENDPOINT`, e.g.
 * https://timmiesettings.table.core.windows.net), reached with the App Service's managed
 * identity: there is no key to store. Without the setting (local dev, tests) settings are
 * kept in memory and are lost on restart.
 */

import { TableClient, type TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import { normaliseAgentSettings, type AgentSettings } from '@/utils/agentSettings';

export const ORG_SETTINGS_TABLE = 'OrgSettings';
const PARTITION = 'org';

export interface OrgSettingsStore {
  /** The organisation's agent, or null when it has never chosen one */
  getAgent(tenantId: string): Promise<AgentSettings | null>;
  setAgent(tenantId: string, agent: AgentSettings, updatedBy: string): Promise<void>;
}

interface OrgSettingsEntity {
  agentKind: string;
  agentName: string;
  updatedBy: string;
  updatedAt: string;
}

export function tableOrgSettingsStore(table: TableClient): OrgSettingsStore {
  return {
    async getAgent(tenantId) {
      try {
        const row = await table.getEntity<OrgSettingsEntity>(PARTITION, tenantId);
        return normaliseAgentSettings({ kind: row.agentKind, name: row.agentName });
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 404) return null;
        throw error;
      }
    },
    async setAgent(tenantId, agent, updatedBy) {
      const entity: TableEntity<OrgSettingsEntity> = {
        partitionKey: PARTITION,
        rowKey: tenantId,
        agentKind: agent.kind,
        agentName: agent.name,
        updatedBy,
        updatedAt: new Date().toISOString(),
      };
      await table.upsertEntity(entity, 'Merge');
    },
  };
}

export function memoryOrgSettingsStore(): OrgSettingsStore {
  const agents = new Map<string, AgentSettings>();
  return {
    async getAgent(tenantId) {
      return agents.get(tenantId) ?? null;
    },
    async setAgent(tenantId, agent) {
      agents.set(tenantId, agent);
    },
  };
}

let store: OrgSettingsStore | null = null;

/** The store for this server: the Azure Table when configured, otherwise in memory */
export function getOrgSettingsStore(): OrgSettingsStore {
  if (!store) {
    const endpoint = process.env.ORG_SETTINGS_TABLE_ENDPOINT;
    store = endpoint
      ? tableOrgSettingsStore(
          new TableClient(endpoint, ORG_SETTINGS_TABLE, new DefaultAzureCredential())
        )
      : memoryOrgSettingsStore();
  }
  return store;
}

/** Use a different store (tests) */
export function setOrgSettingsStore(next: OrgSettingsStore | null): void {
  store = next;
}
