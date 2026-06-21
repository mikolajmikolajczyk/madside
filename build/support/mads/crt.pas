unit crt;
{ Minimal stub for wasip1 cross-compile of MADS.
  MADS only uses TextColor and color constants; we no-op them. }
interface

const
  Black        = 0;
  Blue         = 1;
  Green        = 2;
  Cyan         = 3;
  Red          = 4;
  Magenta      = 5;
  Brown        = 6;
  LightGray    = 7;
  DarkGray     = 8;
  LightBlue    = 9;
  LightGreen   = 10;
  LightCyan    = 11;
  LightRed     = 12;
  LightMagenta = 13;
  Yellow       = 14;
  White        = 15;
  Blink        = 128;

procedure TextColor(c: Byte);
procedure TextBackground(c: Byte);
procedure ClrScr;
procedure GotoXY(x, y: Byte);
function  KeyPressed: Boolean;
function  ReadKey: Char;
procedure NormVideo;

implementation

procedure TextColor(c: Byte); begin end;
procedure TextBackground(c: Byte); begin end;
procedure ClrScr; begin end;
procedure GotoXY(x, y: Byte); begin end;
function  KeyPressed: Boolean; begin Result := False; end;
function  ReadKey: Char; begin Result := #0; end;
procedure NormVideo; begin end;

end.
