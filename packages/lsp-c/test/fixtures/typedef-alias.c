// Typedef-of-pointer alias resolves to the underlying struct.
// @expect-all: head, count
struct List {
  void *head;
  int count;
};
typedef struct List *ListRef;

void use(ListRef lr) {
  lr->|
}
