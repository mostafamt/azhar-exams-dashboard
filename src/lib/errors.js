const MESSAGES = {
  'permission-denied': 'ليس لديك صلاحية للوصول إلى هذه البيانات',
  'not-found': 'العنصر غير موجود',
  unavailable: 'تعذّر الاتصال بالخادم، تحقق من اتصالك بالإنترنت',
}

export function errorMessage(error) {
  return MESSAGES[error?.code] ?? error?.message ?? 'حدث خطأ غير متوقع'
}
