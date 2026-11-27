"use client";

import { useEffect, useId, useRef, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import MenuItem from "@mui/material/MenuItem";
import MenuList from "@mui/material/MenuList";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import { useI18n } from "@/i18n/provider";

/** How long the menu stays open after the pointer left it, so a slightly crooked path into it does not close it. */
const HOVER_CLOSE_DELAY_MS = 200;

/**
 * The signed-in user's name with a placeholder avatar; the account actions open below it on hover, and on click or
 * Enter for touch screens and keyboards.
 */
export function UserMenu({
  name,
  canRequestDeletion,
  onRequestDeletion,
  onSignOut,
}: {
  name: string;
  /** The owner cannot ask for deletion (see requestAccountDeletion). */
  canRequestDeletion: boolean;
  onRequestDeletion: () => void;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const anchor = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  /** Opened by click or keyboard: the first item takes the focus; on hover the pointer stays in charge. */
  const [focusFirst, setFocusFirst] = useState(false);

  const closeTimer = useRef<number | undefined>(undefined);
  const cancelClosing = () => window.clearTimeout(closeTimer.current);
  useEffect(() => cancelClosing, []);

  const close = (returnFocus = false) => {
    cancelClosing();
    setOpen(false);
    if (returnFocus) anchor.current?.focus();
  };
  const choose = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <Box
      onMouseEnter={() => {
        cancelClosing();
        if (open) return;
        setFocusFirst(false);
        setOpen(true);
      }}
      onMouseLeave={() => {
        cancelClosing();
        closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
      }}
      sx={{ position: "relative" }}
    >
      <Button
        ref={anchor}
        color="inherit"
        size="small"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          // Opened by hover, a click keeps it open and moves into it; opened by click, a second one closes it.
          if (open && focusFirst) return close();
          setFocusFirst(true);
          setOpen(true);
        }}
        startIcon={
          <Avatar sx={{ width: 24, height: 24, bgcolor: "primary.main", color: "primary.contrastText" }}>
            <PersonIcon sx={{ fontSize: 18 }} aria-hidden />
          </Avatar>
        }
        sx={{ textTransform: "none", maxWidth: 220 }}
      >
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </Box>
      </Button>
      {/* Kept in the DOM next to the button, so moving the pointer onto the menu does not close it. */}
      <Popper open={open} anchorEl={anchor.current} placement="bottom-end" disablePortal sx={{ zIndex: "modal" }}>
        {/* The button handles its own clicks; a click away from both closes the menu. */}
        <ClickAwayListener
          onClickAway={(event) => {
            if (!(event.target instanceof Node && anchor.current?.contains(event.target))) close();
          }}
        >
          {/* The top padding bridges the gap to the button for the pointer. */}
          <Box sx={{ pt: 0.5 }}>
            <Paper elevation={4}>
              <MenuList
                id={menuId}
                autoFocusItem={focusFirst}
                dense
                onKeyDown={(event) => {
                  if (event.key === "Escape" || event.key === "Tab") {
                    event.preventDefault();
                    close(true);
                  }
                }}
              >
                {canRequestDeletion ? (
                  <MenuItem onClick={choose(onRequestDeletion)}>
                    <ListItemIcon>
                      <PersonRemoveIcon fontSize="small" />
                    </ListItemIcon>
                    {t("account.requestDeletion")}
                  </MenuItem>
                ) : null}
                {canRequestDeletion ? <Divider /> : null}
                <MenuItem onClick={choose(onSignOut)}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  {t("auth.logout")}
                </MenuItem>
              </MenuList>
            </Paper>
          </Box>
        </ClickAwayListener>
      </Popper>
    </Box>
  );
}
