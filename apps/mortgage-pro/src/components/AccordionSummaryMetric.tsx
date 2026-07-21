import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

/**
 * Bold numeric readout for collapsed accordion headers (stays visible before expand).
 */
export function AccordionSummaryMetric({ label, value }: { label: string; value: string }) {
  const muted = value === "—";
  return (
    <Stack spacing={0.2} sx={{ minWidth: 0, flex: "0 1 auto" }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          fontSize: "0.62rem",
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </Typography>
      <Typography
        component="span"
        sx={(t) => ({
          display: "block",
          fontWeight: muted ? 700 : 800,
          fontVariantNumeric: "tabular-nums",
          fontSize: { xs: "0.88rem", sm: "1.05rem" },
          letterSpacing: "-0.025em",
          lineHeight: 1.15,
          color: muted
            ? t.palette.text.secondary
            : t.palette.mode === "light"
              ? t.palette.primary.dark
              : t.palette.primary.light,
          textShadow:
            !muted && t.palette.mode === "dark"
              ? `0 0 22px ${alpha(t.palette.primary.main, 0.5)}, 0 0 1px ${alpha(t.palette.primary.light, 0.4)}`
              : undefined,
        })}
      >
        {value}
      </Typography>
    </Stack>
  );
}
