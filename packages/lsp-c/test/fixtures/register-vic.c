// Register-macro completion: cc65 exposes hardware as a cast #define.
// @expect-includes: bordercolor, bgcolor0
struct __vic2 {
  unsigned char ctrl1;
  unsigned char bordercolor;
  unsigned char bgcolor0;
};
#define VIC (*(struct __vic2 *)0xd000)

void clear(void) {
  VIC.|
}
