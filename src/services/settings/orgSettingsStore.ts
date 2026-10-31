/**
 * Server-side store for per-organisation settings, keyed by Entra tenant ID. Settings
 * live in Timmie itself (not Business Central), so they work whatever the organisation
 * connects to.
 *
 * Production uses an Azure Table (`ORG_SETTINGS_TABLE_ENDPOINT`, e.g.
 * https://timmiesettings.table.core.windows.net), reached with the App Service's managed
 * identity: there is no key to store. Without the setting, development servers keep
 * settings in memory (lost on restart, not shared between instances); a production server
 * can't store them at all, so every organisation gets Timmie's agent and saving is refused
 * (rather than "saving" something the next restart or the other instance forgets).
 */

import { TableClient, type TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import { normaliseAgentSettings, type AgentSettings } from '@/utils/agentSettings';

export const ORG_SETTINGS_TABLE = 'OrgSettings';
const PARTITION = 'org';

export interface OrgSettingsStore {
  /** False when this server has nowhere to keep settings: reads give null, writes throw */
  readonly writable: boolean;
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
    writable: true,
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
    writable: true,
    async getAgent(tenantId) {
      return agents.get(tenantId) ?? null;
    },
    async setAgent(tenantId, agent) {
      agents.set(tenantId, agent);
    },
  };
}

/** No storage configured (production without ORG_SETTINGS_TABLE_ENDPOINT) */
export function unconfiguredOrgSettingsStore(): OrgSettingsStore {
  return {
    writable: false,
    async getAgent() {
      return null;
    },
    async setAgent() {
      throw new Error('ORG_SETTINGS_TABLE_ENDPOINT is not set, so settings cannot be saved');
    },
  };
}

let store: OrgSettingsStore | null = null;

/**
 * The store for this server: the Azure Table when configured, otherwise in memory in
 * development and none in production.
 */
export function getOrgSettingsStore(): OrgSettingsStore {
  if (!store) {
    const endpoint = process.env.ORG_SETTINGS_TABLE_ENDPOINT;
    if (endpoint) {
      store = tableOrgSettingsStore(
        new TableClient(endpoint, ORG_SETTINGS_TABLE, new DefaultAzureCredential())
      );
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('ORG_SETTINGS_TABLE_ENDPOINT is not set: organisation settings cannot be saved');
      store = unconfiguredOrgSettingsStore();
    } else {
      store = memoryOrgSettingsStore();
    }
  }
  return store;
}

/** Use a different store (tests) */
export function setOrgSettingsStore(next: OrgSettingsStore | null): void {
  store = next;
}
