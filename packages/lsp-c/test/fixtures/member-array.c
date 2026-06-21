// @expect-all: r, g, b
struct Color {
  unsigned char r;
  unsigned char g;
  unsigned char b;
};

void paint(void) {
  struct Color palette[16];
  palette[2].|
}
