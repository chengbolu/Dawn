; Keep launcher-local Minecraft instances and saves when NSIS removes or upgrades the app.
; The temporary sibling stays on the same drive, so even very large game folders are renamed
; atomically instead of copied through the system drive.
; electron-builder first compiles a minimal uninstaller stub where customRemoveFiles is absent.
; Keep the cross-macro state variable without turning that intermediate-pass warning into an error.
!pragma warning disable 6001
Var /GLOBAL dclDeleteMinecraftData
!pragma warning enable 6001

!macro customUnInstall
  ; Upgrades reuse the uninstaller internally. Only ask during an explicit interactive uninstall,
  ; and preserve user/game data by default for silent or unattended removal.
  StrCpy $dclDeleteMinecraftData "0"
  ${ifNot} ${isUpdated}
    ${ifNot} ${Silent}
      IfFileExists "$APPDATA\DCL\*.*" ask_delete_user_data
      IfFileExists "$APPDATA\KAMUCL\*.*" ask_delete_user_data user_data_done

ask_delete_user_data:
      MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除 DCL 用户数据？$\r$\n$\r$\n将删除账户登录信息、启动器设置与缓存：$\r$\n$APPDATA\DCL$\r$\n$\r$\n游戏文件与存档将在下一步单独询问。" IDNO user_data_done
      ClearErrors
      RMDir /r "$APPDATA\DCL"
      ; 同时清理升级前遗留的旧品牌目录，避免用户数据残留。
      RMDir /r "$APPDATA\KAMUCL"
      IfErrors 0 user_data_done
      MessageBox MB_OK|MB_ICONEXCLAMATION "部分 DCL 用户数据无法删除，可能仍被其他程序占用：$\r$\n$APPDATA\DCL"

user_data_done:
      IfFileExists "$INSTDIR\.minecraft\*.*" 0 game_data_done
      MessageBox MB_YESNO|MB_ICONEXCLAMATION "是否同时删除全部游戏文件与存档？$\r$\n$\r$\n将永久删除：$\r$\n$INSTDIR\.minecraft$\r$\n$\r$\n其中包括所有游戏版本、模组、资源包、光影、截图和世界存档，删除后无法恢复。" IDNO game_data_done
      StrCpy $dclDeleteMinecraftData "1"

game_data_done:
    ${endif}
  ${endif}
!macroend

!macro customRemoveFiles
  ${if} $dclDeleteMinecraftData == "1"
    Goto remove_launcher
  ${endif}
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
  ${if} $dclDeleteMinecraftData == "1"
    IfFileExists "$INSTDIR\.minecraft\*.*" 0 remove_done
    MessageBox MB_OK|MB_ICONEXCLAMATION "部分游戏文件无法删除，可能仍被其他程序占用，剩余文件位于：$\r$\n$INSTDIR\.minecraft"
    Goto remove_done
  ${endif}
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
