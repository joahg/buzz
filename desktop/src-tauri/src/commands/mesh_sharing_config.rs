use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MeshSharingConfig {
    pub(super) enabled: bool,
    pub(super) model_id: String,
    pub(super) max_vram_gb: Option<u64>,
}

const LEGACY_MESH_SHARING_CONFIG_FILE: &str = "mesh-sharing.json";

fn mesh_sharing_config_path(app: &AppHandle, community_scope: &str) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
    Ok(mesh_sharing_config_path_for_data_dir(
        &data_dir,
        community_scope,
    ))
}

pub(super) fn mesh_sharing_config_path_for_data_dir(data_dir: &Path, scope: &str) -> PathBuf {
    data_dir.join("mesh-sharing").join(format!("{scope}.json"))
}

pub(super) fn legacy_mesh_sharing_config_path_for_data_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(LEGACY_MESH_SHARING_CONFIG_FILE)
}

pub(super) fn save_mesh_sharing_config_to_path(
    path: &Path,
    config: &MeshSharingConfig,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create mesh config directory: {error}"))?;
    }
    let payload = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("failed to encode mesh sharing config: {error}"))?;
    crate::managed_agents::atomic_write_json(path, &payload)
}

fn read_mesh_sharing_config(path: &Path) -> Result<Option<MeshSharingConfig>, String> {
    match std::fs::read(path) {
        Ok(payload) => serde_json::from_slice(&payload)
            .map(Some)
            .map_err(|error| format!("failed to parse {}: {error}", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("failed to read {}: {error}", path.display())),
    }
}

/// Load one relay's sharing preference, claiming the legacy app-wide file for
/// exactly the first relay that sees it.
///
/// The intermediate filename includes the opaque relay scope. Renaming the
/// legacy file there first atomically binds it to one relay before the scoped
/// JSON is written, so a crash during migration cannot make a second relay
/// inherit the same old `enabled: true` setting on the next launch.
pub(super) fn load_mesh_sharing_config_from_paths(
    scoped_path: &Path,
    legacy_path: &Path,
) -> Result<Option<MeshSharingConfig>, String> {
    if let Some(config) = read_mesh_sharing_config(scoped_path)? {
        // A downgrade may have recreated the legacy app-wide file after this
        // relay already wrote a scoped preference. Retire that stale file now
        // so a later relay cannot claim it. The scoped value remains
        // authoritative for this relay.
        if legacy_path.exists() {
            let retired_path = scoped_path.with_extension("legacy-retired");
            if !retired_path.exists() {
                match std::fs::rename(legacy_path, &retired_path) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => {
                        return Err(format!(
                            "failed to retire legacy mesh sharing config {}: {error}",
                            legacy_path.display()
                        ));
                    }
                }
            } else if let Err(error) = std::fs::remove_file(legacy_path) {
                if error.kind() != std::io::ErrorKind::NotFound {
                    return Err(format!(
                        "failed to retire legacy mesh sharing config {}: {error}",
                        legacy_path.display()
                    ));
                }
            }
        }
        return Ok(Some(config));
    }

    let migration_path = scoped_path.with_extension("migrating");
    if !migration_path.exists() {
        if let Some(parent) = migration_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create mesh config directory: {error}"))?;
        }
        match std::fs::rename(legacy_path, &migration_path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                // Another concurrent load may have completed the same claim.
                if let Some(config) = read_mesh_sharing_config(scoped_path)? {
                    return Ok(Some(config));
                }
                if !migration_path.exists() {
                    return Ok(None);
                }
            }
            Err(error) => {
                return Err(format!(
                    "failed to claim legacy mesh sharing config {}: {error}",
                    legacy_path.display()
                ));
            }
        }
    }

    let Some(config) = read_mesh_sharing_config(&migration_path)? else {
        return Ok(None);
    };
    save_mesh_sharing_config_to_path(scoped_path, &config)?;
    if let Err(error) = std::fs::remove_file(&migration_path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            eprintln!(
                "buzz-mesh: migrated sharing config but could not remove {}: {error}",
                migration_path.display()
            );
        }
    }
    Ok(Some(config))
}

pub(super) fn save_mesh_sharing_config_for_scope(
    app: &AppHandle,
    community_scope: &str,
    config: &MeshSharingConfig,
) -> Result<(), String> {
    let path = mesh_sharing_config_path(app, community_scope)?;
    save_mesh_sharing_config_to_path(&path, config)
}

pub(super) fn load_mesh_sharing_config_for_scope(
    app: &AppHandle,
    community_scope: &str,
) -> Result<Option<MeshSharingConfig>, String> {
    let scoped_path = mesh_sharing_config_path(app, community_scope)?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
    load_mesh_sharing_config_from_paths(
        &scoped_path,
        &legacy_mesh_sharing_config_path_for_data_dir(&data_dir),
    )
}
