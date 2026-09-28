'use client'

/**
 * Component catalogue for src/components/ui (#253): every primitive with each
 * variant, size, and state, rendered once in the site theme and once inside a
 * `.dark` wrapper so both themes sit side by side. It's the one place to run
 * contrast and accessible-name audits against. Served only by page.dev.tsx,
 * which exists only under `next dev` (see pageExtensions in next.config.ts).
 *
 * Overlay content (dialog, sheet, menus, popover, hover card) renders in a
 * portal on <body>, so when opened it follows the site theme, not the panel.
 * Use the theme toggle to check those in each mode.
 */
import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import Skeleton, {
  ActivitySkeleton,
  CardSkeleton,
  DashboardSkeleton,
  FormSkeleton,
  ListSkeleton,
  LoadingSpinner,
  NotificationSkeleton,
  StatCardSkeleton,
  TableSkeleton,
} from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VirtualizedList } from '@/components/ui/virtualized-list'

const BUTTON_VARIANTS = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const
const BUTTON_SIZES = ['default', 'sm', 'lg', 'icon'] as const
const BADGE_VARIANTS = ['default', 'secondary', 'destructive', 'outline'] as const
const SHEET_SIDES = ['top', 'right', 'bottom', 'left'] as const
const ROWS = Array.from({ length: 60 }, (_, i) => `Row ${i + 1}`)

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

/** One entry per file in src/components/ui — test/component-catalogue.test.tsx enforces that. */
export const SECTIONS: { file: string; render: () => ReactNode }[] = [
  {
    file: 'avatar',
    render: () => (
      <Row>
        <Avatar>
          <AvatarImage src="/icon.png" alt="OurDAO" />
          <AvatarFallback>OD</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>GA</AvatarFallback>
        </Avatar>
      </Row>
    ),
  },
  {
    file: 'badge',
    render: () => (
      <Row>
        {BADGE_VARIANTS.map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </Row>
    ),
  },
  {
    file: 'button',
    render: () => (
      <div className="space-y-3">
        {BUTTON_VARIANTS.map((v) => (
          <Row key={v}>
            {BUTTON_SIZES.map((s) => (
              <Button key={s} variant={v} size={s} aria-label={s === 'icon' ? `${v} icon` : undefined}>
                {s === 'icon' ? '★' : `${v} ${s}`}
              </Button>
            ))}
            <Button variant={v} disabled>
              disabled
            </Button>
            <Button variant={v} loading>
              loading
            </Button>
          </Row>
        ))}
      </div>
    ),
  },
  {
    file: 'card',
    render: () => (
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Card title</CardTitle>
          <CardDescription>Card description</CardDescription>
        </CardHeader>
        <CardContent>Card content</CardContent>
        <CardFooter>
          <Button size="sm">Footer action</Button>
        </CardFooter>
      </Card>
    ),
  },
  {
    file: 'dialog',
    render: () => (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Open dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog title</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    file: 'dropdown-menu',
    render: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Open menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Label</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem>
              Item <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem inset>Inset item</DropdownMenuItem>
            <DropdownMenuItem disabled>Disabled item</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Checkbox item</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a">Radio A</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="b">Radio B</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Submenu</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Sub item</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
  {
    file: 'hover-card',
    render: () => (
      <HoverCard>
        <HoverCardTrigger asChild>
          <Button variant="link">Hover me</Button>
        </HoverCardTrigger>
        <HoverCardContent>Hover card content</HoverCardContent>
      </HoverCard>
    ),
  },
  {
    file: 'navigation-menu',
    render: () => (
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Trigger</NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="w-48 p-4">Menu content</div>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="#" className={navigationMenuTriggerStyle()}>
              Link
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    ),
  },
  {
    file: 'popover',
    render: () => (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Open popover</Button>
        </PopoverTrigger>
        <PopoverContent>Popover content</PopoverContent>
      </Popover>
    ),
  },
  {
    file: 'separator',
    render: () => (
      <div className="space-y-3">
        <Separator />
        <div className="flex h-6 items-center gap-3">
          Left <Separator orientation="vertical" /> Right
        </div>
      </div>
    ),
  },
  {
    file: 'sheet',
    render: () => (
      <Row>
        {SHEET_SIDES.map((side) => (
          <Sheet key={side}>
            <SheetTrigger asChild>
              <Button variant="outline">Sheet {side}</Button>
            </SheetTrigger>
            <SheetContent side={side}>
              <SheetHeader>
                <SheetTitle>Sheet ({side})</SheetTitle>
                <SheetDescription>Sheet description</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        ))}
      </Row>
    ),
  },
  {
    file: 'skeleton',
    render: () => (
      <div className="space-y-4">
        <Row>
          <Skeleton variant="text" width="w-32" />
          <Skeleton variant="circular" width="w-10" height="h-10" />
          <Skeleton variant="rectangular" width="w-24" height="h-10" />
          <Skeleton animation={false} width="w-24" />
          <LoadingSpinner size="sm" />
          <LoadingSpinner size="md" />
          <LoadingSpinner size="lg" />
        </Row>
        <CardSkeleton showImage showActions />
        <ListSkeleton items={2} showAvatar />
        <TableSkeleton rows={2} columns={3} />
        <StatCardSkeleton />
        <FormSkeleton fields={2} />
        <NotificationSkeleton />
        <ActivitySkeleton />
        <DashboardSkeleton />
      </div>
    ),
  },
  {
    file: 'tabs',
    render: () => (
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
          <TabsTrigger value="three" disabled>
            Disabled
          </TabsTrigger>
        </TabsList>
        <TabsContent value="one">First tab content</TabsContent>
        <TabsContent value="two">Second tab content</TabsContent>
      </Tabs>
    ),
  },
  {
    file: 'virtualized-list',
    render: () => (
      <div className="grid gap-4 sm:grid-cols-2">
        <VirtualizedList
          items={ROWS.slice(0, 3)}
          keyExtractor={(r) => r}
          renderItem={(r) => <div className="border-b border-border p-2">{r}</div>}
          listAriaLabel="Below threshold"
        />
        <VirtualizedList
          items={ROWS}
          itemHeight={41}
          maxHeight={200}
          keyExtractor={(r) => r}
          renderItem={(r) => <div className="border-b border-border p-2">{r}</div>}
          listAriaLabel="Virtualized"
        />
      </div>
    ),
  },
]

function Panel({ label, className }: { label: string; className?: string }) {
  return (
    <section aria-label={label} className={`${className ?? ''} min-w-0 space-y-8 bg-background p-6 text-foreground`}>
      <h2 className="text-lg font-semibold">{label}</h2>
      {SECTIONS.map(({ file, render }) => (
        <div key={file} className="space-y-3">
          <h3 className="font-mono text-sm text-muted-foreground">ui/{file}</h3>
          {render()}
        </div>
      ))}
    </section>
  )
}

export function ComponentCatalogue() {
  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border p-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">UI component catalogue</h1>
          <p className="text-sm text-muted-foreground">
            Development only. The left panel follows the site theme; the right is always dark.
          </p>
        </div>
        <ThemeToggle />
      </header>
      <div className="grid lg:grid-cols-2">
        <Panel label="Site theme" />
        <Panel label="Dark theme" className="dark" />
      </div>
    </main>
  )
}
