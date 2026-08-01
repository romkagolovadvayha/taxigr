# Route map

Expo Router root: `src/app`.

| URL | Entry | Main component | Layout |
| --- | --- | --- | --- |
| `/` | `src/app/index.tsx` | `OrderScreen` for authenticated users | Root + passenger map shell |
| `/address-search` | `src/app/address-search.tsx` | `AddressSearchScreen` | Native form sheet |
| `/orders` | `src/app/orders.tsx` | Orders history | Root |
| `/orders/[id]` | `src/app/orders/[id].tsx` | Order details | Root |
| `/profile` | `src/app/profile.tsx` | Passenger profile | Root |
| `/settings` | `src/app/settings.tsx` | Passenger settings | Root |
| `/driver-application` | `src/app/driver-application.tsx` | Driver application | Root |
| `/driver` | `src/app/driver/index.tsx` | Driver home/map | Driver protected stack |
| `/driver/earnings` | `src/app/driver/earnings.tsx` | Driver earnings | Driver protected stack |
| `/driver/profile` | `src/app/driver/profile.tsx` | Driver profile | Driver protected stack |
| `/admin` | `src/app/admin/index.tsx` | Admin dashboard | Admin shell |
| `/admin/applications` | `src/app/admin/applications.tsx` | Applications | Admin shell |
| `/admin/drivers` | `src/app/admin/drivers.tsx` | Drivers | Admin shell |
| `/admin/orders` | `src/app/admin/orders.tsx` | Orders monitor | Admin shell |
| `/admin/settings` | `src/app/admin/settings.tsx` | Tariffs/commission | Admin shell |
| `/sign-in` | `src/app/sign-in.tsx` | VK/demo sign-in | Public root |

`src/app/_layout.tsx` contains the full protected route configuration.
