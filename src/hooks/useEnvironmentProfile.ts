import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { EnvironmentProfile, computeProfileCompleteness, industryToSectors } from '../types/environment';
import { LOG_SOURCE_GROUPS } from '../services/logSourceDiscovery';
import { useToast } from './useToast';

interface UseEnvironmentProfileReturn {
  profile: EnvironmentProfile | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  fetchProfile: () => Promise<void>;
  saveProfile: (updates: Partial<EnvironmentProfile>) => Promise<boolean>;
  createProfile: (data: Partial<EnvironmentProfile>) => Promise<boolean>;
}

/** Map old human-readable log source names to new group keys */
const OLD_LOG_SOURCE_TO_GROUP_KEY: Record<string, string> = {
  'Windows Security Event Log': 'windows_security',
  'Windows PowerShell Logs': 'windows_powershell',
  'Windows Sysmon': 'windows_sysmon',
  'Windows WMI': 'windows_sysmon', // WMI events are in sysmon group
  'Windows Defender': 'windows_system',
  'Linux Syslog': 'linux_process',
  'Linux Auditd': 'linux_auditd',
  'macOS Unified Logs': 'macos',
  'EDR Telemetry': 'edr_telemetry',
  'Firewall Logs': 'network_firewall',
  'DNS Logs': 'network_proxy',
  'Proxy Logs': 'network_proxy',
  'IDS/IPS Alerts': 'network_ids',
  'WAF Logs': 'webserver',
  'Network Flow Data': 'network_zeek',
  'DHCP Logs': 'windows_system',
  'Active Directory Audit': 'windows_security',
  'Azure AD / Entra ID Logs': 'azure_audit',
  'Authentication Logs': 'system_logs',
  'VPN Logs': 'network_firewall',
  'AWS CloudTrail': 'aws_cloudtrail',
  'AWS GuardDuty': 'aws_cloudtrail',
  'GCP Audit Logs': 'gcp_audit',
  'Office 365 Audit Logs': 'm365_office',
  'Kubernetes Audit Logs': 'kubernetes',
  'Container Logs': 'kubernetes',
  'Email Gateway Logs': 'm365_office',
  'Database Audit Logs': 'application_code',
  'Certificate Logs': 'windows_system',
};

/** Backward compat: migrate old profile fields to v2 */
function migrateProfile(raw: any): EnvironmentProfile {
  const profile = raw as EnvironmentProfile;

  // Ensure v2 fields have defaults
  if (!profile.sectors) profile.sectors = [];
  if (!profile.threat_origin_countries) profile.threat_origin_countries = [];
  if (profile.user_country === undefined) profile.user_country = null;

  // Auto-migrate: if industry set but sectors empty, derive from industry
  if (profile.industry && profile.sectors.length === 0) {
    profile.sectors = industryToSectors(profile.industry);
  }

  // Auto-migrate: if log_sources contains old human-readable names, convert to group keys
  if (profile.log_sources && profile.log_sources.length > 0) {
    const hasOldValues = profile.log_sources.some(s => s in OLD_LOG_SOURCE_TO_GROUP_KEY);
    const hasNewValues = profile.log_sources.some(s => s in LOG_SOURCE_GROUPS);

    if (hasOldValues && !hasNewValues) {
      // Convert old values to new group keys
      const newKeys = new Set<string>();
      for (const oldSource of profile.log_sources) {
        const groupKey = OLD_LOG_SOURCE_TO_GROUP_KEY[oldSource];
        if (groupKey) newKeys.add(groupKey);
      }
      profile.log_sources = Array.from(newKeys);
    }
  }

  return profile;
}

export function useEnvironmentProfile(): UseEnvironmentProfileReturn {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<EnvironmentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: fetchError } = await supabase
        .from('environment_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      setProfile(data ? migrateProfile(data) : null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load environment profile';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createProfile = useCallback(async (data: Partial<EnvironmentProfile>): Promise<boolean> => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const completeness = computeProfileCompleteness(data);

      const { data: created, error: insertError } = await supabase
        .from('environment_profiles')
        .insert({
          user_id: user.id,
          industry: data.industry || null,
          sectors: data.sectors || [],
          user_country: data.user_country || null,
          threat_origin_countries: data.threat_origin_countries || [],
          siem_platforms: data.siem_platforms || [],
          log_sources: data.log_sources || [],
          custom_log_sources: data.custom_log_sources || [],
          edr_tools: data.edr_tools || [],
          cloud_platforms: data.cloud_platforms || {},
          crown_jewels: data.crown_jewels || [],
          profile_completeness: completeness,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      setProfile(migrateProfile(created));
      showToast('success', 'Profile Created', 'Environment profile saved successfully');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create profile';
      showToast('error', 'Save Failed', msg);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [showToast]);

  const saveProfile = useCallback(async (updates: Partial<EnvironmentProfile>): Promise<boolean> => {
    if (!profile) return createProfile(updates);

    setIsSaving(true);
    try {
      const merged = { ...profile, ...updates };
      const completeness = computeProfileCompleteness(merged);

      const { data: updated, error: updateError } = await supabase
        .from('environment_profiles')
        .update({
          industry: merged.industry,
          sectors: merged.sectors,
          user_country: merged.user_country,
          threat_origin_countries: merged.threat_origin_countries,
          siem_platforms: merged.siem_platforms,
          log_sources: merged.log_sources,
          custom_log_sources: merged.custom_log_sources,
          edr_tools: merged.edr_tools,
          cloud_platforms: merged.cloud_platforms,
          crown_jewels: merged.crown_jewels,
          profile_completeness: completeness,
        })
        .eq('id', profile.id)
        .select()
        .single();

      if (updateError) throw updateError;
      setProfile(migrateProfile(updated));
      showToast('success', 'Profile Updated', 'Environment profile saved successfully');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile';
      showToast('error', 'Save Failed', msg);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [profile, showToast, createProfile]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, isLoading, isSaving, error, fetchProfile, saveProfile, createProfile };
}
