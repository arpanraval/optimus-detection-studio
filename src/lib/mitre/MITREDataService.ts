/**
 * MITRE ATT&CK Data Ingestion Service
 * Fetches and loads complete MITRE data from official source
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  StixBundle,
  StixBundleObject,
  AttackPattern,
  IntrusionSet,
  Malware,
  Tool,
  CourseOfAction,
  Campaign,
  Tactic,
  DataSource,
  DataComponent,
  StixRelationship,
  MitreMetadata
} from '@/types/mitre-stix';

const MITRE_STIX_URL = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json';

export interface IngestionProgress {
  stage: string;
  current: number;
  total: number;
  message: string;
}

export class MITREDataIngestionService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Main ingestion method - fetches and loads all MITRE data
   */
  async ingestData(
    onProgress?: (progress: IngestionProgress) => void
  ): Promise<MitreMetadata> {
    try {
      // Stage 1: Fetch STIX bundle
      this.reportProgress(onProgress, 'fetch', 0, 1, 'Fetching MITRE ATT&CK data from GitHub...');
      const bundle = await this.fetchStixBundle();
      this.reportProgress(onProgress, 'fetch', 1, 1, `Fetched ${bundle.objects.length} objects`);

      // Stage 2: Parse objects
      this.reportProgress(onProgress, 'parse', 0, 1, 'Parsing STIX objects...');
      const parsed = this.parseStixBundle(bundle);
      this.reportProgress(onProgress, 'parse', 1, 1, 'Parsed all objects');

      // Stage 3: Clear existing data (optional - for re-ingestion)
      this.reportProgress(onProgress, 'clear', 0, 1, 'Clearing existing data...');
      await this.clearExistingData();
      this.reportProgress(onProgress, 'clear', 1, 1, 'Cleared existing data');

      // Stage 4: Insert objects
      this.reportProgress(onProgress, 'objects', 0, parsed.objects.length, 'Inserting objects...');
      await this.insertObjects(parsed.objects, (current) => {
        this.reportProgress(onProgress, 'objects', current, parsed.objects.length, `Inserted ${current}/${parsed.objects.length} objects`);
      });

      // Stage 5: Insert relationships
      this.reportProgress(onProgress, 'relationships', 0, parsed.relationships.length, 'Inserting relationships...');
      await this.insertRelationships(parsed.relationships, (current) => {
        this.reportProgress(onProgress, 'relationships', current, parsed.relationships.length, `Inserted ${current}/${parsed.relationships.length} relationships`);
      });

      // Stage 6: Build junction tables
      this.reportProgress(onProgress, 'junctions', 0, 3, 'Building junction tables...');
      await this.buildTacticJunctions();
      this.reportProgress(onProgress, 'junctions', 1, 3, 'Built tactic junctions');
      await this.buildPlatformJunctions();
      this.reportProgress(onProgress, 'junctions', 2, 3, 'Built platform junctions');
      await this.buildDataSourceJunctions();
      this.reportProgress(onProgress, 'junctions', 3, 3, 'Built data source junctions');

      // Stage 7: Generate metadata
      this.reportProgress(onProgress, 'metadata', 0, 1, 'Generating metadata...');
      const metadata = await this.generateMetadata(bundle);
      this.reportProgress(onProgress, 'metadata', 1, 1, 'Ingestion complete!');

      return metadata;
    } catch (error) {
      console.error('Ingestion failed:', error);
      throw error;
    }
  }

  /**
   * Fetch STIX bundle from GitHub
   */
  private async fetchStixBundle(): Promise<StixBundle> {
    const response = await fetch(MITRE_STIX_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch MITRE data: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Parse STIX bundle into objects and relationships
   */
  private parseStixBundle(bundle: StixBundle): {
    objects: StixBundleObject[];
    relationships: StixRelationship[];
  } {
    const objects: StixBundleObject[] = [];
    const relationships: StixRelationship[] = [];

    for (const obj of bundle.objects) {
      if (obj.type === 'relationship') {
        relationships.push(obj as StixRelationship);
      } else {
        objects.push(obj);
      }
    }

    return { objects, relationships };
  }

  /**
   * Clear existing data (for re-ingestion)
   */
  private async clearExistingData(): Promise<void> {
    // Clear in order of dependencies
    await this.supabase.from('mitre_technique_data_sources').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await this.supabase.from('mitre_technique_platforms').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await this.supabase.from('mitre_technique_tactics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await this.supabase.from('mitre_relationships').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await this.supabase.from('mitre_objects').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await this.supabase.from('mitre_metadata').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  /**
   * Insert objects in batches
   */
  private async insertObjects(
    objects: StixBundleObject[],
    onProgress?: (current: number) => void
  ): Promise<void> {
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < objects.length; i += BATCH_SIZE) {
      const batch = objects.slice(i, i + BATCH_SIZE);
      const records = batch.map(obj => this.objectToRecord(obj));
      
      const { error } = await this.supabase
        .from('mitre_objects')
        .insert(records);
      
      if (error) {
        console.error('Error inserting batch:', error);
        throw error;
      }
      
      if (onProgress) {
        onProgress(Math.min(i + BATCH_SIZE, objects.length));
      }
    }
  }

  /**
   * Convert STIX object to database record
   */
  private objectToRecord(obj: StixBundleObject): any {
    const mitreId = this.extractMitreId(obj);
    
    return {
      stix_id: obj.id,
      type: obj.type,
      mitre_id: mitreId,
      name: (obj as any).name || null,
      description: (obj as any).description || null,
      created: obj.created,
      modified: obj.modified,
      data: obj,
      deprecated: obj.x_mitre_deprecated || false,
      revoked: obj.revoked || false
    };
  }

  /**
   * Extract MITRE ID from external references
   */
  private extractMitreId(obj: StixBundleObject): string | null {
    if (!obj.external_references) return null;
    
    const mitreRef = obj.external_references.find(
      ref => ref.source_name === 'mitre-attack'
    );
    
    return mitreRef?.external_id || null;
  }

  /**
   * Insert relationships in batches
   */
  private async insertRelationships(
    relationships: StixRelationship[],
    onProgress?: (current: number) => void
  ): Promise<void> {
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < relationships.length; i += BATCH_SIZE) {
      const batch = relationships.slice(i, i + BATCH_SIZE);
      const records = batch.map(rel => ({
        stix_id: rel.id,
        relationship_type: rel.relationship_type,
        source_ref: rel.source_ref,
        target_ref: rel.target_ref,
        description: rel.description || null,
        data: rel,
        created: rel.created,
        modified: rel.modified
      }));
      
      const { error } = await this.supabase
        .from('mitre_relationships')
        .insert(records);
      
      if (error) {
        console.error('Error inserting relationships:', error);
        throw error;
      }
      
      if (onProgress) {
        onProgress(Math.min(i + BATCH_SIZE, relationships.length));
      }
    }
  }

  /**
   * Build tactic junction table
   */
  private async buildTacticJunctions(): Promise<void> {
    const { data: techniques } = await this.supabase
      .from('mitre_objects')
      .select('stix_id, data')
      .eq('type', 'attack-pattern');
    
    if (!techniques) return;
    
    const records: any[] = [];
    
    for (const tech of techniques) {
      const data = tech.data as AttackPattern;
      if (data.kill_chain_phases) {
        for (const phase of data.kill_chain_phases) {
          if (phase.kill_chain_name === 'mitre-attack') {
            // Find tactic STIX ID by shortname
            const { data: tactic } = await this.supabase
              .from('mitre_objects')
              .select('stix_id')
              .eq('type', 'x-mitre-tactic')
              .eq('data->>x_mitre_shortname', phase.phase_name)
              .single();
            
            if (tactic) {
              records.push({
                technique_stix_id: tech.stix_id,
                tactic_stix_id: tactic.stix_id,
                tactic_shortname: phase.phase_name
              });
            }
          }
        }
      }
    }
    
    if (records.length > 0) {
      await this.supabase
        .from('mitre_technique_tactics')
        .insert(records);
    }
  }

  /**
   * Build platform junction table
   */
  private async buildPlatformJunctions(): Promise<void> {
    const { data: techniques } = await this.supabase
      .from('mitre_objects')
      .select('stix_id, data')
      .eq('type', 'attack-pattern');
    
    if (!techniques) return;
    
    const records: any[] = [];
    
    for (const tech of techniques) {
      const data = tech.data as AttackPattern;
      if (data.x_mitre_platforms) {
        for (const platform of data.x_mitre_platforms) {
          records.push({
            technique_stix_id: tech.stix_id,
            platform: platform
          });
        }
      }
    }
    
    if (records.length > 0) {
      await this.supabase
        .from('mitre_technique_platforms')
        .insert(records);
    }
  }

  /**
   * Build data source junction table
   */
  private async buildDataSourceJunctions(): Promise<void> {
    const { data: techniques } = await this.supabase
      .from('mitre_objects')
      .select('stix_id, data')
      .eq('type', 'attack-pattern');
    
    if (!techniques) return;
    
    const records: any[] = [];
    
    for (const tech of techniques) {
      const data = tech.data as AttackPattern;
      if (data.x_mitre_data_sources) {
        for (const dataSource of data.x_mitre_data_sources) {
          records.push({
            technique_stix_id: tech.stix_id,
            data_source: dataSource
          });
        }
      }
    }
    
    if (records.length > 0) {
      await this.supabase
        .from('mitre_technique_data_sources')
        .insert(records);
    }
  }

  /**
   * Generate metadata
   */
  private async generateMetadata(bundle: StixBundle): Promise<MitreMetadata> {
    // Count objects by type
    const { count: techniqueCount } = await this.supabase
      .from('mitre_objects')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'attack-pattern');
    
    const { count: groupCount } = await this.supabase
      .from('mitre_objects')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'intrusion-set');
    
    const { count: softwareCount } = await this.supabase
      .from('mitre_objects')
      .select('*', { count: 'exact', head: true })
      .in('type', ['malware', 'tool']);
    
    const { count: campaignCount } = await this.supabase
      .from('mitre_objects')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'campaign');
    
    const { count: mitigationCount } = await this.supabase
      .from('mitre_objects')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'course-of-action');
    
    const { count: relationshipCount } = await this.supabase
      .from('mitre_relationships')
      .select('*', { count: 'exact', head: true });
    
    const metadata = {
      framework_version: '18.1', // Extract from bundle if available
      stix_version: '2.1',
      last_updated: new Date().toISOString(),
      total_techniques: techniqueCount || 0,
      total_groups: groupCount || 0,
      total_software: softwareCount || 0,
      total_campaigns: campaignCount || 0,
      total_mitigations: mitigationCount || 0,
      total_relationships: relationshipCount || 0
    };
    
    // Insert metadata
    const { data, error } = await this.supabase
      .from('mitre_metadata')
      .insert(metadata)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  /**
   * Helper to report progress
   */
  private reportProgress(
    callback: ((progress: IngestionProgress) => void) | undefined,
    stage: string,
    current: number,
    total: number,
    message: string
  ): void {
    if (callback) {
      callback({ stage, current, total, message });
    }
  }
}
