import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

type AppSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  /** Optional right-side meta (metrics, actions). */
  aside?: ReactNode;
  className?: string;
};

/** One job per section: headline, short support, content. No card chrome. */
export function AppSection({ title, description, children, aside, className }: AppSectionProps) {
  return (
    <Box
      component="section"
      className={className}
      sx={{
        py: { xs: 2, sm: 2.5 },
        borderTop: "1px solid",
        borderColor: "divider",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        alignItems={{ sm: "flex-end" }}
        justifyContent="space-between"
        sx={{ mb: description || aside ? 1.75 : 1.25 }}
      >
        <Box sx={{ minWidth: 0, maxWidth: 560 }}>
          <Typography
            variant="h6"
            sx={{
              fontSize: { xs: "1.15rem", sm: "1.28rem" },
              mb: description ? 0.4 : 0,
            }}
          >
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {aside ? <Box sx={{ flexShrink: 0 }}>{aside}</Box> : null}
      </Stack>
      {children}
    </Box>
  );
}
