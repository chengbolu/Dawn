; Keep launcher-local Minecraft instances and saves when NSIS removes or upgrades the app.
; The temporary sibling stays on the same drive, so even very large game folders are renamed
; atomically instead of copied through the system drive.
!macro customRemoveFiles
  IfFileExists "$INSTDIR\.minecraft\*.*" preserve_minecraft remove_launcher

preserve_minecraft:
  IfFileExists "$INSTDIR.__dcl_minecraft_preserve\*.*" 0 preserve_move
  MessageBox MB_ICONSTOP "无法安全卸载：$INSTDIR.__dcl_minecraft_preserve 已存在。请先处理该目录，游戏文件未被删除。"
  Abort

preserve_move:
  ; IfFileExists may leave NSIS' process-wide error flag set. Always clear it before
  ; checking the result of a filesystem operation, otherwise a successful rename is
  ; reported as a failure and the first uninstall has to be repeated.
  ClearErrors
  Rename "$INSTDIR\.minecraft" "$INSTDIR.__dcl_minecraft_preserve"
  IfErrors 0 remove_launcher
  MessageBox MB_ICONSTOP "无法暂存 .minecraft，卸载已取消，游戏文件未被删除。"
  Abort

remove_launcher:
  ClearErrors
  RMDir /r "$INSTDIR"
  IfFileExists "$INSTDIR.__dcl_minecraft_preserve\*.*" 0 remove_done
  ClearErrors
  CreateDirectory "$INSTDIR"
  IfErrors restore_failed
  ClearErrors
  Rename "$INSTDIR.__dcl_minecraft_preserve" "$INSTDIR\.minecraft"
  IfErrors 0 remove_done

restore_failed:
  MessageBox MB_ICONEXCLAMATION "启动器已卸载，但 .minecraft 暂存于：$INSTDIR.__dcl_minecraft_preserve"

remove_done:
!macroend
